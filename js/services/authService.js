/**
 * Barber Studio — Auth Service com Hierarquia de Papéis:
 * 'barbeiro' (Dono Supremo) > 'admin' (Outros Barbeiros) > 'cliente' (Clientes)
 */

import { supabase, SUPABASE_ENABLED } from '../supabase/supabase-config.js';
import { cleanPhone } from '../core/utils.js';
import { emailService } from './emailService.js';

// Email do Dono do Atelier
const MASTER_BARBER_EMAIL = 'rui@barberstudio.demo';

let cachedUser = null;
let isInitialized = false;
const authListeners = new Set();

function buildUser(authUser, profile = {}) {
  if (!authUser) return null;
  const metadata = authUser.user_metadata || {};
  const emailLower = (authUser.email || '').toLowerCase().trim();

  // Determinar papel na hierarquia
  let userRole = 'cliente';
  if (emailLower === MASTER_BARBER_EMAIL || profile.tipo_utilizador === 'barbeiro' || metadata.role === 'barbeiro') {
    userRole = 'barbeiro'; // Dono
  } else if (profile.tipo_utilizador === 'admin' || metadata.role === 'admin') {
    userRole = 'admin'; // Barbeiro da equipa
  }

  return {
    id: authUser.id,
    email: authUser.email,
    emailVerified: Boolean(authUser.email_confirmed_at || authUser.confirmed_at),
    // O perfil manda: é lá que fica o nome quando o utilizador o altera
    name: profile.nome || metadata.name || metadata.full_name || (authUser.email ? authUser.email.split('@')[0] : 'Utilizador'),
    phone: profile.telemovel || metadata.phone || '',
    role: userRole,
    userType: userRole,
    isMasterBarber: userRole === 'barbeiro'
  };
}

// Uma conta conta como "acabada de criar" durante este tempo
const NEW_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Email de conta criada para quem se regista com a Google.
 * (No registo por email e password o envio é feito em register().)
 * A conta é criada do lado da Google, por isso reconhece-se pela data de
 * criação; uma marca no dispositivo evita enviar duas vezes.
 */
function welcomeOAuthUser(authUser) {
  const provider = authUser?.app_metadata?.provider;
  if (!provider || provider === 'email' || !authUser.email) return;

  const createdAt = Date.parse(authUser.created_at || '');
  if (!createdAt || Math.abs(Date.now() - createdAt) > NEW_ACCOUNT_WINDOW_MS) return;

  const flagKey = `barberstudio_welcome_sent_${authUser.id}`;
  try {
    if (localStorage.getItem(flagKey)) return;
    localStorage.setItem(flagKey, '1');
  } catch (err) {
    return; // Sem localStorage não há como evitar repetições: não se envia
  }

  const meta = authUser.user_metadata || {};
  emailService.sendWelcomeEmail({
    name: meta.full_name || meta.name || '',
    email: authUser.email
  }).catch(e => console.warn('Aviso envio email boas-vindas:', e));
}

// Ouvinte do estado de autenticação
if (SUPABASE_ENABLED && supabase) {
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      welcomeOAuthUser(session.user);
      try {
        let { data: profile, error: profileError } = await supabase
          .from('perfis')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();

        // Se for novo login OAuth e ainda não tiver registo na tabela perfis.
        // (Se a leitura falhou, não se sabe se existe: não se escreve nada.)
        if (!profile && !profileError && session.user.id) {
          const meta = session.user.user_metadata || {};
          const emailLower = (session.user.email || '').toLowerCase().trim();
          const autoRole = emailLower === MASTER_BARBER_EMAIL ? 'barbeiro' : 'cliente';
          const newProfile = {
            id: session.user.id,
            nome: meta.full_name || meta.name || (session.user.email ? session.user.email.split('@')[0] : 'Cliente'),
            email: emailLower,
            telemovel: meta.phone || '',
            tipo_utilizador: autoRole
          };
          // Só cria: um perfil que já exista (com o nome e telemóvel que o
          // cliente alterou) nunca é substituído pelos dados da Google
          await supabase.from('perfis').upsert(newProfile, { onConflict: 'id', ignoreDuplicates: true });
          const { data: saved } = await supabase
            .from('perfis')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle();
          profile = saved || newProfile;
        }

        cachedUser = buildUser(session.user, profile || {});
      } catch (e) {
        cachedUser = buildUser(session.user, {});
      }
    } else {
      cachedUser = null;
    }
    isInitialized = true;
    authListeners.forEach(listener => {
      try { listener(cachedUser, event); } catch (err) { console.error(err); }
    });
  });
}

export const authService = {
  onAuthStateChange(callback) {
    authListeners.add(callback);
    if (isInitialized) callback(cachedUser, 'INITIAL');
    return () => authListeners.delete(callback);
  },

  async getCurrentUser() {
    if (!SUPABASE_ENABLED || !supabase) return null;

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user) {
        cachedUser = null;
        isInitialized = true;
        return null;
      }

      const user = session.user;
      let profile = {};
      try {
        const { data } = await supabase
          .from('perfis')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        if (data) profile = data;
      } catch (pErr) {
        console.warn('Perfil warning:', pErr);
      }

      cachedUser = buildUser(user, profile);
      isInitialized = true;
      return cachedUser;
    } catch (e) {
      cachedUser = null;
      isInitialized = true;
      return null;
    }
  },

  async login(identifier, password) {
    if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase não está configurado.');

    let trimmedEmail = (identifier || '').trim().toLowerCase();
    const trimmedPassword = (password || '').trim();

    // Sem "@" é um nome: a base de dados diz a que email corresponde
    // (função email_para_login, em supabase/bd-portugues.sql)
    const byName = Boolean(trimmedEmail) && !trimmedEmail.includes('@');
    const nameError = 'Nome ou password incorretos. Se não conseguires, entra com o teu email.';
    if (byName) {
      const { data: foundEmail, error: lookupError } = await supabase.rpc('email_para_login', { p_nome: trimmedEmail });
      if (lookupError) console.warn('email_para_login indisponível:', lookupError);
      if (lookupError || !foundEmail) throw new Error(nameError);
      trimmedEmail = String(foundEmail).trim().toLowerCase();
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: trimmedPassword
    });

    if (error) throw new Error(byName ? nameError : 'Email ou password incorretos.');

    const { data: prof } = await supabase
      .from('perfis')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    const built = buildUser(data.user, prof || {});
    cachedUser = built;
    isInitialized = true;
    authListeners.forEach(l => l(cachedUser, 'SIGNED_IN'));
    return built;
  },

  /**
   * Autenticação Externa (Google / Microsoft Azure)
   */
  async loginWithProvider(provider) {
    if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase não está configurado.');

    const redirectTo = `${window.location.origin}/index.html`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider, // 'google' ou 'azure'
      options: {
        redirectTo: redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) {
      console.error(`Erro no OAuth com ${provider}:`, error);
      throw new Error(error.message || `Erro ao autenticar com ${provider}.`);
    }

    return data;
  },

  async register({ name, email, phone, password }) {
    if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase não está configurado.');

    const trimmedEmail = (email || '').trim().toLowerCase();
    const trimmedPassword = (password || '').trim();
    const phoneClean = cleanPhone(phone);

    // Todos os registos públicos são estritamente 'cliente' por segurança, a menos que seja o email mestre do barbeiro
    const assignedRole = trimmedEmail === MASTER_BARBER_EMAIL ? 'barbeiro' : 'cliente';

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password: trimmedPassword,
      options: {
        data: { name: name.trim(), phone: phoneClean, role: assignedRole }
      }
    });

    if (error) throw new Error(error.message || 'Erro ao criar conta.');

    const user = data.user || { id: 'temp', email: trimmedEmail };
    if (user.id && user.id !== 'temp') {
      await supabase.from('perfis').upsert({
        id: user.id,
        nome: name.trim(),
        email: trimmedEmail,
        telemovel: phoneClean,
        tipo_utilizador: assignedRole
      });
    }

    const built = buildUser(user, { nome: name, telemovel: phoneClean, tipo_utilizador: assignedRole });
    cachedUser = built;
    isInitialized = true;

    // Email de conta criada, sem esperar pela resposta.
    // (Para um email já registado o Supabase devolve um utilizador sem identidades: aí não se envia.)
    const isNewAccount = !Array.isArray(data.user?.identities) || data.user.identities.length > 0;
    if (isNewAccount) {
      emailService.sendWelcomeEmail({
        name: name.trim(),
        email: trimmedEmail
      }).catch(e => console.warn('Aviso envio email boas-vindas:', e));
    }

    return built;
  },

  async requestPasswordReset(email) {
    if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase não está configurado.');

    const trimmedEmail = (email || '').trim().toLowerCase();
    if (!trimmedEmail) throw new Error('Por favor introduz o teu email.');

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${window.location.origin}/login.html`
    });

    if (error) {
      console.error('Erro no resetPasswordForEmail:', error);
      throw new Error(error.message || 'Erro ao enviar email de recuperação.');
    }

    await emailService.sendPasswordResetEmail(trimmedEmail);
    return true;
  },

  async changePassword(userId, newPassword) {
    if (!SUPABASE_ENABLED || !supabase) throw new Error('Supabase não está configurado.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message || 'Erro ao alterar password.');
    return true;
  },

  async logout() {
    if (!SUPABASE_ENABLED || !supabase) return true;
    await supabase.auth.signOut();
    cachedUser = null;
    authListeners.forEach(l => l(null, 'SIGNED_OUT'));
    return true;
  },

  // =========================================================================
  // GESTÃO EXCLUSIVA DA EQUIPA (APENAS PARA O DONO / BARBER)
  // =========================================================================

  /**
   * Lista todos os utilizadores para o Dono gerir permissões
   */
  async getTeamMembers() {
    const user = await this.getCurrentUser();
    if (!user || user.role !== 'barbeiro') {
      throw new Error('Apenas o Dono do estúdio pode gerir a equipa.');
    }

    const { data, error } = await supabase
      .from('perfis')
      .select('id, nome, email, telemovel, tipo_utilizador, criado_em')
      .order('criado_em', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * Promove ou despromove um membro da equipa ('admin' <-> 'cliente')
   */
  async updateStaffRole(targetId, newRole) {
    const user = await this.getCurrentUser();
    if (!user || user.role !== 'barbeiro') {
      throw new Error('Apenas o Dono do estúdio pode gerir a equipa.');
    }
    if (newRole !== 'admin' && newRole !== 'cliente') {
      throw new Error('Permissão inválida.');
    }

    const { data, error } = await supabase
      .from('perfis')
      .update({ tipo_utilizador: newRole })
      .eq('id', targetId)
      .select('id, tipo_utilizador');

    if (error) throw new Error(error.message || 'Erro ao alterar permissão.');
    if (!data || data.length === 0 || data[0].tipo_utilizador !== newRole) {
      throw new Error('A permissão não foi alterada. Verifica as políticas (RLS) no Supabase.');
    }
    return data[0];
  },

  /**
   * Atualiza o perfil do utilizador autenticado
   */
  async updateProfile(userId, updates) {
    if (!SUPABASE_ENABLED || !supabase) {
      throw new Error('Supabase não está configurado.');
    }

    const dbUpdates = {};
    if (updates.name) dbUpdates.nome = updates.name.trim();
    if (updates.email) dbUpdates.email = updates.email.trim().toLowerCase();
    if (updates.phone) dbUpdates.telemovel = updates.phone.trim();

    const { data, error } = await supabase
      .from('perfis')
      .update(dbUpdates)
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message || 'Erro ao atualizar perfil.');

    // Sem linha devolvida, a base de dados não gravou nada (ex.: permissões):
    // não se pode dizer ao cliente que ficou guardado
    if (!data) {
      console.error('Perfil não gravado: nenhuma linha alterada para', userId);
      throw new Error('As alterações não foram guardadas. Tenta de novo e, se continuar, avisa o Rui.');
    }

    // Refresh current user cache
    const user = await this.getCurrentUser();
    return user;
  }
};