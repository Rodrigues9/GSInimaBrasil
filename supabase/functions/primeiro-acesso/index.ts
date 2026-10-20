// Primeiro acesso: a pessoa cadastrada pelo administrador (perfil sem conta) define a própria senha.
//
// POST { acao: "verificar", login }        -> { pendente: boolean }
// POST { acao: "criar", login, senha }     -> { ok: true }  (cria a conta no Auth e liga ao perfil)
//
// Roda sem login (verify_jwt desligado), por isso só cria conta para perfis ativos que ainda não têm uma.
import { createClient } from "npm:@supabase/supabase-js@2";

const DOMINIO_LOGIN = "usuarios.gsinima.local";
const LOGIN_OK = /^[a-z0-9._-]{3,40}$/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return resposta({ erro: "Método não permitido." }, 405);

  let dados: { acao?: string; login?: string; senha?: string };
  try {
    dados = await req.json();
  } catch {
    return resposta({ erro: "Pedido inválido." }, 400);
  }
  const login = String(dados.login ?? "").trim().toLowerCase();
  if (!LOGIN_OK.test(login)) return resposta({ pendente: false });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: perfil, error } = await admin
    .from("perfis").select("id, nome, ativo, usuario_id").eq("login", login).maybeSingle();
  if (error) return resposta({ erro: "Não foi possível consultar o cadastro." }, 500);
  const pendente = !!perfil && perfil.ativo && !perfil.usuario_id;

  if (dados.acao === "verificar") return resposta({ pendente });

  if (dados.acao !== "criar") return resposta({ erro: "Ação desconhecida." }, 400);
  if (!pendente) return resposta({ erro: "Este login não está aguardando o primeiro acesso." }, 400);

  const senha = String(dados.senha ?? "");
  if (senha.length < 8) return resposta({ erro: "A senha precisa ter pelo menos 8 caracteres." }, 400);
  if (senha.length > 72) return resposta({ erro: "A senha pode ter no máximo 72 caracteres." }, 400);

  const criado = await admin.auth.admin.createUser({
    email: `${login}@${DOMINIO_LOGIN}`,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: perfil!.nome },
  });
  if (criado.error || !criado.data.user) {
    return resposta({ erro: "Não foi possível criar a senha. Tente de novo ou fale com o administrador." }, 400);
  }

  // Liga a conta ao perfil, só se ninguém fez isso antes (dois cliques ao mesmo tempo).
  const ligado = await admin
    .from("perfis").update({ usuario_id: criado.data.user.id })
    .eq("id", perfil!.id).is("usuario_id", null).select("id");
  if (ligado.error || !ligado.data?.length) {
    await admin.auth.admin.deleteUser(criado.data.user.id);
    return resposta({ erro: "Este login já foi ativado. Entre com a sua senha." }, 409);
  }

  return resposta({ ok: true });
});
