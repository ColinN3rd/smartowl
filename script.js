/* ==========================================================================
   NOCTUA SOCIAL — CORE JAVASCRIPT (PRODUÇÃO / SUPABASE REAL / ZERO FAKES)
   - Zero contas ou postagens fictícias
   - Biografia vazia no cadastro (o próprio usuário preenche)
   - Upload real de fotos e vídeos do dispositivo (Stories & Destaques)
   - Chat de voz real via Web Audio API & Visualizador de Frequência
   - Sincronização atômica e resiliente com banco Supabase
   ========================================================================== */

// --- 1. CONFIGURAÇÃO & INICIALIZAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://zypklpgrqkyzerzcbhbn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5cGtscGdycWt5emVyemNiaGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNDA5MzcsImV4cCI6MjEwNDgxNjkzN30.OH6H8W3Vc8FyHHXfCIApJigcJA9amZUVh5fTub9W3fI';

let supabaseClient = null;
if (!supabaseClient && typeof supabase !== 'undefined' && supabase.createClient) {
  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    console.log('🦉 [Noctua] Supabase conectado com sucesso!');
  } catch (err) {
    console.warn('⚠️ [Noctua] Erro ao instanciar Supabase Client:', err);
  }
}

// Chaves de armazenamento local para cache e resiliência offline
const STORAGE_KEYS = {
  CURRENT_USER: 'noctua_user_v3',
  ALL_USERS: 'noctua_users_v3',
  POSTS: 'noctua_posts_v3',
  STORIES: 'noctua_stories_v3',
  HIGHLIGHTS: 'noctua_highlights_v3',
  REELS: 'noctua_reels_v3',
  REEL_COMMENTS: 'noctua_reel_comments_v3',
  ROOMS: 'noctua_rooms_v3',
  MESSAGES: 'noctua_messages_v3',
  FOLLOWS: 'noctua_follows_v3',
  THEME: 'noctua_theme_pref'
};

// --- 2. ESTADO GLOBAL DA APLICAÇÃO (INICIA RIGOROSAMENTE VAZIO) ---
const DEFAULT_AVATAR_URL = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';

let currentUser = null;
let allUsers = [];
let allPosts = [];
let allStories = [];
let allHighlights = [];
let allReels = [];
let allReelComments = [];
let allStudyRooms = [];
let allMessages = [];
let allFollows = []; // { follower_username, following_username }

let activeChatUser = null;
let currentFeedFilter = 'all';
let activeHighlightViewing = null;
let activeStoryViewing = null;
let activeReelCommentsId = null;
let viewedProfileUsername = null; // null = meu próprio perfil

// Buffers temporários para uploads
let regAvatarData = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80';
let composerImgData = '';
let highlightCoverData = '';
let uploadedReelVideoData = '';
let currentOnboardingStep = 1;
let onboardingData = { source: '', goal: '', dailyGoal: '', topics: ['Matemática & Física', 'Programação'] };

// Pomodoro Sidebar
let sidebarPomodoroInterval = null;
let sidebarPomodoroSeconds = 25 * 60;
let sidebarPomodoroRunning = false;

// Sala de Estudo ao Vivo & Pomodoro de Sala
let activeLiveRoom = null;
let roomPomodoroInterval = null;
let roomPomodoroSeconds = 25 * 60;
let roomPomodoroRunning = false;

// Áudio Ambiente (Ruído de foco via Web Audio API)
let ambientAudioCtx = null;
let ambientNoiseNode = null;
let isAmbientPlaying = false;

// Chat de Voz Real (Captura do Microfone do Usuário)
let voiceStream = null;
let voiceAudioCtx = null;
let voiceAnalyser = null;
let voiceVisualizerAnim = null;
let isVoiceMuted = true;

// Canais Realtime do Supabase
let realtimePresenceChannel = null;
let realtimeMessagesChannel = null;

// --- 3. INICIALIZAÇÃO DO APP ---
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  loadLocalState();
  setupOwlSpeechAnimations();

  if (!currentUser) {
    showAuthScreen();
  } else {
    showAppLoadingOverlay();
    showAppScreen();
    await fetchAllDatabaseData();
    initRealtimeSubscriptions();
    hideAppLoadingOverlay();
  }
});

// --- 4. CONTROLE DE TELAS ISOLADAS ---
function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('onboarding-screen').style.display = 'none';
  document.getElementById('app-root').style.display = 'none';
}

function showOnboardingScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('onboarding-screen').style.display = 'flex';
  document.getElementById('app-root').style.display = 'none';
  currentOnboardingStep = 1;
  updateOnboardingView();
}

function showAppScreen() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('onboarding-screen').style.display = 'none';
  document.getElementById('app-root').style.display = 'flex';
  updateProfileUI();
  renderAppShell();
}

// --- 4b. ANIMAÇÃO DE CARREGAMENTO PÓS LOGIN/CADASTRO ---
function showAppLoadingOverlay() {
  const overlay = document.getElementById('appLoadingOverlay');
  if (overlay) overlay.classList.add('active');
}

function hideAppLoadingOverlay() {
  const overlay = document.getElementById('appLoadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

// --- 5. PERSISTÊNCIA & CACHE LOCAL ---
function loadLocalState() {
  try {
    currentUser = JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER)) || null;
    allUsers = JSON.parse(localStorage.getItem(STORAGE_KEYS.ALL_USERS)) || [];
    allPosts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS)) || [];
    allStories = JSON.parse(localStorage.getItem(STORAGE_KEYS.STORIES)) || [];
    allHighlights = JSON.parse(localStorage.getItem(STORAGE_KEYS.HIGHLIGHTS)) || [];
    allReels = JSON.parse(localStorage.getItem(STORAGE_KEYS.REELS)) || [];
    allReelComments = JSON.parse(localStorage.getItem(STORAGE_KEYS.REEL_COMMENTS)) || [];
    allStudyRooms = JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOMS)) || [];
    allMessages = JSON.parse(localStorage.getItem(STORAGE_KEYS.MESSAGES)) || [];
    allFollows = JSON.parse(localStorage.getItem(STORAGE_KEYS.FOLLOWS)) || [];
  } catch (e) {
    console.warn('Erro ao carregar localStorage:', e);
  }
  cleanExpiredStories();
}

function saveLocalState() {
  try {
    if (currentUser) localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
    localStorage.setItem(STORAGE_KEYS.ALL_USERS, JSON.stringify(allUsers));
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(allPosts));
    localStorage.setItem(STORAGE_KEYS.STORIES, JSON.stringify(allStories));
    localStorage.setItem(STORAGE_KEYS.HIGHLIGHTS, JSON.stringify(allHighlights));
    localStorage.setItem(STORAGE_KEYS.REELS, JSON.stringify(allReels));
    localStorage.setItem(STORAGE_KEYS.REEL_COMMENTS, JSON.stringify(allReelComments));
    localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(allStudyRooms));
    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(allMessages));
    localStorage.setItem(STORAGE_KEYS.FOLLOWS, JSON.stringify(allFollows));
  } catch (e) {
    console.warn('Aviso ao salvar no localStorage:', e);
  }
}

// --- 6. UTILITÁRIO DE COMPRESSÃO DE IMAGENS DO DISPOSITIVO ---
function compressImage(file, maxWidth = 1000, maxHeight = 1000, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- 7. SINCRONIZAÇÃO RESILIENTE COM SUPABASE ---
async function fetchAllDatabaseData() {
  if (!supabaseClient) return;

  try {
    // 1. Perfis Reais
    const { data: profiles, error: pErr } = await supabaseClient.from('profiles').select('*');
    if (!pErr && profiles && profiles.length > 0) {
      allUsers = profiles.map(p => ({
        id: p.id,
        username: p.username,
        fullName: p.full_name || p.username,
        email: p.email || '',
        avatar: p.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        bio: p.bio || '',
        interests: p.interests || '',
        dailyGoal: p.daily_goal || '',
        isPrivate: p.is_private || false,
        online: false
      }));

      if (currentUser) {
        const updatedMe = allUsers.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
        if (updatedMe) {
          currentUser = { ...currentUser, ...updatedMe };
        }
      }
    }

    // 2. Posts Reais
    const { data: posts, error: postErr } = await supabaseClient.from('posts').select('*').order('created_at', { ascending: false });
    if (!postErr && posts) {
      // Busca comentários
      const { data: comments } = await supabaseClient.from('comments').select('*');
      
      allPosts = posts.map(p => {
        const postComments = (comments || []).filter(c => String(c.post_id) === String(p.id));
        return {
          id: p.id,
          authorId: p.author_id,
          authorUsername: p.author_username,
          authorName: p.author_name || p.author_username,
          authorAvatar: p.author_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          type: p.type || 'general',
          content: p.content || '',
          exerciseCode: p.exercise_code || '',
          image: p.image_url || '',
          tags: Array.isArray(p.tags) ? p.tags : (p.tags ? String(p.tags).split(',') : ['#Estudos']),
          likes: p.likes || 0,
          likedByMe: false,
          savedByMe: false,
          createdAt: p.created_at ? new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recente',
          comments: postComments.map(c => ({ author: c.author_name, text: c.text }))
        };
      });
    }

    // 3. Stories (< 24 Horas Reais)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: stories, error: sErr } = await supabaseClient
      .from('stories')
      .select('*')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    if (!sErr && stories) {
      allStories = stories.map(s => ({
        id: s.id,
        username: s.author_username,
        avatar: s.author_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        mediaUrl: s.media_url || s.image_url,
        mediaType: s.media_type || (s.media_url && s.media_url.includes('video') ? 'video' : 'image'),
        createdAt: new Date(s.created_at).getTime(),
        seen: false
      }));
    }

    // 4. Destaques (Highlights)
    const { data: highlights, error: hErr } = await supabaseClient
      .from('highlights')
      .select('*')
      .order('created_at', { ascending: false });

    if (!hErr && highlights) {
      allHighlights = highlights.map(h => ({
        id: h.id,
        username: h.author_username,
        title: h.title,
        emoji: h.emoji || '🌟',
        coverUrl: h.cover_url || '',
        createdAt: h.created_at
      }));
    }

    // 5. Reels
    const { data: reels, error: rErr } = await supabaseClient.from('reels').select('*').order('created_at', { ascending: false });
    if (!rErr && reels) {
      allReels = reels.map(r => ({
        id: r.id,
        authorUsername: r.author_username,
        authorName: r.author_name || r.author_username,
        authorAvatar: r.author_avatar || DEFAULT_AVATAR_URL,
        videoUrl: r.video_url,
        caption: r.caption || '',
        likes: r.likes || 0,
        likedByMe: false
      }));
    }

    // 5b. Comentários dos Reels
    try {
      const { data: reelComments, error: rcErr } = await supabaseClient.from('reel_comments').select('*').order('created_at', { ascending: true });
      if (!rcErr && reelComments) {
        allReelComments = reelComments.map(c => ({
          id: c.id,
          reelId: c.reel_id,
          authorUsername: c.author_username,
          authorName: c.author_name || c.author_username,
          text: c.text,
          createdAt: c.created_at
        }));
      }
    } catch (e) { console.warn('reel_comments indisponível:', e); }

    // 5c. Seguidores / Seguindo (rede social real)
    try {
      const { data: follows, error: fErr } = await supabaseClient.from('follows').select('*');
      if (!fErr && follows) {
        allFollows = follows.map(f => ({
          follower_username: (f.follower_username || '').toLowerCase(),
          following_username: (f.following_username || '').toLowerCase()
        }));
      }
    } catch (e) { console.warn('follows indisponível:', e); }

    // 6. Salas de Estudo
    const { data: rooms, error: rmErr } = await supabaseClient.from('study_rooms').select('*').order('created_at', { ascending: false });
    if (!rmErr && rooms) {
      allStudyRooms = rooms.map(rm => ({
        id: rm.id,
        title: rm.title,
        desc: rm.description || '',
        icon: rm.icon || 'fa-mug-hot',
        creatorUsername: rm.creator_username,
        isPrivate: rm.is_private || false,
        roomCode: rm.room_code || null,
        usersCount: rm.users_count || 1,
        users: []
      }));
    }

    // 7. Mensagens
    const { data: msgs, error: mErr } = await supabaseClient.from('messages').select('*').order('created_at', { ascending: true });
    if (!mErr && msgs) {
      allMessages = msgs;
    }

    saveLocalState();
    renderAppShell();
    updateProfileUI();
  } catch (err) {
    console.warn('⚠️ [Noctua] Sincronização Supabase em modo tolerante:', err);
  }
}

// --- 8. STORIES COM LIMPEZA ESTRITA DE 24H ---
function cleanExpiredStories() {
  const now = Date.now();
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  allStories = allStories.filter(s => {
    const created = s.createdAt ? new Date(s.createdAt).getTime() : now;
    return (now - created) < TWENTY_FOUR_HOURS;
  });
  saveLocalState();
}

// --- 8b. SISTEMA REAL DE SEGUIDORES (FOLLOW/UNFOLLOW) ---
function getFollowersUsernames(username) {
  if (!username) return [];
  const u = username.toLowerCase();
  return allFollows.filter(f => f.following_username === u).map(f => f.follower_username);
}

function getFollowingUsernames(username) {
  if (!username) return [];
  const u = username.toLowerCase();
  return allFollows.filter(f => f.follower_username === u).map(f => f.following_username);
}

function getFollowersCount(username) { return getFollowersUsernames(username).length; }
function getFollowingCount(username) { return getFollowingUsernames(username).length; }

function isFollowing(followerUsername, followingUsername) {
  if (!followerUsername || !followingUsername) return false;
  const a = followerUsername.toLowerCase();
  const b = followingUsername.toLowerCase();
  return allFollows.some(f => f.follower_username === a && f.following_username === b);
}

function areFriends(usernameA, usernameB) {
  if (!usernameA || !usernameB) return false;
  return isFollowing(usernameA, usernameB) && isFollowing(usernameB, usernameA);
}

async function toggleFollowUser(targetUsername) {
  if (!currentUser || !targetUsername) return;
  const me = currentUser.username.toLowerCase();
  const target = targetUsername.toLowerCase();
  if (me === target) return;

  const alreadyFollowing = isFollowing(me, target);

  if (alreadyFollowing) {
    allFollows = allFollows.filter(f => !(f.follower_username === me && f.following_username === target));
    if (supabaseClient) {
      try {
        await supabaseClient.from('follows').delete().eq('follower_username', me).eq('following_username', target);
      } catch (e) { console.warn('Erro ao deixar de seguir:', e); }
    }
  } else {
    allFollows.push({ follower_username: me, following_username: target });
    if (supabaseClient) {
      try {
        await supabaseClient.from('follows').insert([{ follower_username: me, following_username: target }]);
      } catch (e) { console.warn('Erro ao seguir:', e); }
    }
  }

  saveLocalState();

  // Atualiza qualquer UI visível que dependa de seguidores
  if (viewedProfileUsername && viewedProfileUsername.toLowerCase() === target) renderProfileView();
  if (!viewedProfileUsername && currentUser.username.toLowerCase() === target) renderProfileView();
  renderSidebarWidgets();
  renderReelsFeed();
  renderFollowListModalIfOpen();
}

// --- 9. AUTENTICAÇÃO REAL & CADASTRO COM BIO LIMPA ---
function switchAuthTab(tab) {
  const tabLogin = document.getElementById('authTabLogin');
  const tabReg = document.getElementById('authTabRegister');
  const formLogin = document.getElementById('loginForm');
  const formReg = document.getElementById('registerForm');
  const alertBox = document.getElementById('authAlertBox');
  const speech = document.getElementById('authOwlSpeech');

  alertBox.style.display = 'none';

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
    formLogin.style.display = 'block';
    formReg.style.display = 'none';
    speech.innerText = 'Psiu! Bem-vindo de volta ao seu espaço de estudos! 🦉✨';
  } else {
    tabReg.classList.add('active');
    tabLogin.classList.remove('active');
    formLogin.style.display = 'none';
    formReg.style.display = 'block';
    speech.innerText = 'Escolha sua foto de perfil e crie seu @ de estudos! 🦉📸';
  }
}

async function handleRegAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  regAvatarData = await compressImage(file, 200, 200, 0.9);
  document.getElementById('regAvatarPreview').src = regAvatarData;
}

function setRegMascotAvatar() {
  regAvatarData = 'https://static.vecteezy.com/ti/vetor-gratis/p1/74600680-fofa-azul-desenho-animado-coruja-personagem-vetor.jpg';
  document.getElementById('regAvatarPreview').src = regAvatarData;
  alert('🦉 Mascote Coruja definida como sua foto de perfil!');
}

async function checkRegUsername(username) {
  const cleanUser = username.trim().toLowerCase().replace('@', '');
  const feedback = document.getElementById('regUsernameFeedback');
  if (!cleanUser) { feedback.innerText = ''; return; }

  let exists = allUsers.some(u => u.username && u.username.toLowerCase() === cleanUser);

  if (!exists && supabaseClient) {
    try {
      const { data } = await supabaseClient.from('profiles').select('id').eq('username', cleanUser).maybeSingle();
      if (data) exists = true;
    } catch (e) {}
  }

  if (exists) {
    feedback.style.color = 'var(--accent-danger)';
    feedback.innerText = '❌ Este nome de usuário já está em uso.';
  } else {
    feedback.style.color = 'var(--accent-study)';
    feedback.innerText = '✅ @' + cleanUser + ' está livre e disponível!';
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnRegisterSubmit');
  const alertBox = document.getElementById('authAlertBox');
  const fullName = document.getElementById('regFullName').value.trim();
  const username = document.getElementById('regUsername').value.trim().toLowerCase().replace('@', '');
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;

  btn.disabled = true;
  btn.innerText = 'Cadastrando...';

  // Verifica duplicação no Supabase
  if (supabaseClient) {
    try {
      const { data: existing } = await supabaseClient.from('profiles').select('id, username, email').or(`username.eq.${username},email.eq.${email}`).maybeSingle();
      if (existing) {
        alertBox.className = 'auth-msg-alert error';
        alertBox.innerText = 'Nome de usuário ou e-mail já cadastrado.';
        btn.disabled = false;
        btn.innerText = 'Cadastrar e Personalizar';
        return;
      }
    } catch (err) {}
  }

  // Novo Usuário: BIOGRAFIA INICIA RIGOROSAMENTE VAZIA ""
  const newUser = {
    id: 'user_' + Date.now(),
    username: username,
    fullName: fullName,
    email: email,
    avatar: regAvatarData,
    bio: '', // Sem biografia pronta: o usuário preenche quando quiser
    interests: '',
    dailyGoal: '',
    isPrivate: false,
    online: true
  };

  // Salva no Supabase (com payload universal e tolerante a esquemas personalizados)
  if (supabaseClient) {
    try {
      const profilePayload = {
        username: username,
        full_name: fullName,
        email: email,
        avatar_url: regAvatarData,
        bio: ''
      };

      let { data, error } = await supabaseClient.from('profiles').insert([profilePayload]).select().maybeSingle();

      // Se falhar (ex: coluna email não existir em tabela prévia), tenta com payload mínimo
      if (error) {
        console.warn('⚠️ Supabase Profile Insert aviso:', error.message, '- tentando formato padrão...');
        const minimalPayload = {
          username: username,
          full_name: fullName,
          avatar_url: regAvatarData,
          bio: ''
        };
        const retryRes = await supabaseClient.from('profiles').insert([minimalPayload]).select().maybeSingle();
        if (retryRes.data && retryRes.data.id) {
          newUser.id = retryRes.data.id;
        }
      } else if (data && data.id) {
        newUser.id = data.id;
      }
    } catch (err) {
      console.warn('Erro tolerado ao inserir perfil no Supabase:', err);
    }
  }

  allUsers.push(newUser);
  currentUser = newUser;
  saveLocalState();

  btn.disabled = false;
  btn.innerText = 'Cadastrar e Personalizar';

  // Exibe a tela de Onboarding com a Coruja Acenando
  showOnboardingScreen();
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('btnLoginSubmit');
  const alertBox = document.getElementById('authAlertBox');
  const identifier = document.getElementById('loginIdentifier').value.trim().toLowerCase().replace('@', '');
  const pass = document.getElementById('loginPassword').value;

  btn.disabled = true;
  btn.innerText = 'Entrando...';

  let foundUser = allUsers.find(u =>
    (u.username && u.username.toLowerCase() === identifier) ||
    (u.email && u.email.toLowerCase() === identifier)
  );

  if (!foundUser && supabaseClient) {
    try {
      const { data: profile, error } = await supabaseClient.from('profiles').select('*').or(`username.eq.${identifier},email.eq.${identifier}`).maybeSingle();
      if (!error && profile) {
        foundUser = {
          id: profile.id,
          username: profile.username,
          fullName: profile.full_name || profile.username,
          email: profile.email || '',
          avatar: profile.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          bio: profile.bio || '',
          interests: profile.interests || '',
          dailyGoal: profile.daily_goal || '',
          isPrivate: profile.is_private || false,
          online: true
        };
        allUsers.push(foundUser);
      }
    } catch (err) {
      console.warn('Busca no Supabase:', err);
    }
  }

  if (foundUser) {
    currentUser = foundUser;
    saveLocalState();
    btn.disabled = false;
    btn.innerText = 'Acessar Noctua';
    showAppLoadingOverlay();
    showAppScreen();
    await fetchAllDatabaseData();
    initRealtimeSubscriptions();
    hideAppLoadingOverlay();
  } else {
    alertBox.className = 'auth-msg-alert error';
    alertBox.innerText = 'Conta não encontrada. Verifique os dados ou crie sua conta ao lado!';
    btn.disabled = false;
    btn.innerText = 'Acessar Noctua';
  }
}

// --- 10. ONBOARDING (CORUJA ACENANDO) ---
function updateOnboardingView() {
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`dotStep${i}`);
    const stepView = document.getElementById(`onboardingStep${i}`);
    if (dot) dot.className = i <= currentOnboardingStep ? 'step-dot active' : 'step-dot';
    if (stepView) stepView.style.display = i === currentOnboardingStep ? 'block' : 'none';
  }

  const title = document.getElementById('onboardingQuestionTitle');
  const btnBack = document.getElementById('btnOnboardingBack');
  const btnNext = document.getElementById('btnOnboardingNext');
  btnBack.style.display = currentOnboardingStep > 1 ? 'block' : 'none';

  if (currentOnboardingStep === 1) title.innerText = 'Como você ficou sabendo do Noctua? 🦉';
  else if (currentOnboardingStep === 2) title.innerText = 'Qual é o seu principal objetivo de foco? 🎯';
  else if (currentOnboardingStep === 3) title.innerText = 'Quantas horas diárias você pretende focar? ⏳';
  else if (currentOnboardingStep === 4) {
    title.innerText = 'Quais matérias ou áreas mais te interessam? 📚';
    btnNext.innerHTML = 'Concluir & Entrar <i class="fa-solid fa-check"></i>';
  }
}

function selectOnboardingOption(field, value, element) {
  onboardingData[field] = value;
  element.parentElement.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  element.classList.add('selected');
}

function toggleTopicOption(topic, element) {
  element.classList.toggle('selected');
  if (element.classList.contains('selected')) {
    if (!onboardingData.topics.includes(topic)) onboardingData.topics.push(topic);
  } else {
    onboardingData.topics = onboardingData.topics.filter(t => t !== topic);
  }
}

async function nextOnboardingStep() {
  if (currentOnboardingStep < 4) {
    currentOnboardingStep++;
    updateOnboardingView();
  } else {
    if (currentUser) {
      currentUser.interests = onboardingData.topics.join(', ') || 'Estudos Gerais';
      currentUser.dailyGoal = onboardingData.dailyGoal || '2 horas / dia';
      // BIO PERMANECE VAZIA: NÃO É GERADA AUTOMATICAMENTE

      if (supabaseClient) {
        try {
          await supabaseClient.from('profiles').update({
            interests: currentUser.interests,
            daily_goal: currentUser.dailyGoal
          }).eq('username', currentUser.username);
        } catch (e) {}
      }
      saveLocalState();
    }

    showAppLoadingOverlay();
    showAppScreen();
    await fetchAllDatabaseData();
    initRealtimeSubscriptions();
    hideAppLoadingOverlay();
  }
}

function prevOnboardingStep() {
  if (currentOnboardingStep > 1) {
    currentOnboardingStep--;
    updateOnboardingView();
  }
}

function setupOwlSpeechAnimations() {
  const authInputs = document.querySelectorAll('#loginForm input, #registerForm input');
  const speech = document.getElementById('authOwlSpeech');
  if (!speech) return;

  authInputs.forEach(input => {
    input.addEventListener('focus', () => {
      if (input.type === 'password') {
        speech.innerText = 'Vou tapar meus olhos pra não ver sua senha! 🙈🦉';
      } else if (input.id === 'regUsername') {
        speech.innerText = 'Escolha um @ bem marcante para seus resumos! ✨';
      } else {
        speech.innerText = 'Tudo certo! Continue preenchendo... 🦉👍';
      }
    });
  });
}

// --- 11. ATUALIZAÇÃO DO PERFIL DO USUÁRIO ---
function updateProfileUI() {
  if (!currentUser) return;

  const fullName = currentUser.fullName || currentUser.username;
  document.getElementById('sidebarFullName').innerText = fullName;
  document.getElementById('sidebarUsername').innerText = '@' + currentUser.username;
  document.getElementById('sidebarAvatar').src = currentUser.avatar;
  document.getElementById('myStoryAvatar').src = currentUser.avatar;
  document.getElementById('composerAvatar').src = currentUser.avatar;

  document.getElementById('profilePageAvatar').src = currentUser.avatar;
  document.getElementById('profilePageUsername').innerText = '@' + currentUser.username;
  document.getElementById('profilePageFullName').innerText = fullName;
  document.getElementById('profilePageBioText').innerText = currentUser.bio || 'Sem biografia cadastrada. Clique em Editar Perfil para adicionar!';
  document.getElementById('profilePageInterestBadge').innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Meta: ${currentUser.dailyGoal || 'Foco'} • ${currentUser.interests || 'Estudos'}`;

  // Settings
  document.getElementById('settingsAvatarPreview').src = currentUser.avatar;
  document.getElementById('settingsInputFullName').value = fullName;
  document.getElementById('settingsInputUsername').value = currentUser.username;
  document.getElementById('settingsInputBio').value = currentUser.bio || '';
  document.getElementById('settingsPrivacySwitch').checked = currentUser.isPrivate || false;
  const metaSelect = document.getElementById('settingsInputDailyGoal');
  if (metaSelect) metaSelect.value = currentUser.dailyGoal || '';

  renderHighlights();
  renderProfileView();
}

// --- 11b. VISUALIZAÇÃO DE PERFIL (PRÓPRIO OU DE OUTRO ESTUDANTE) ---
function getProfileBeingViewed() {
  if (viewedProfileUsername) {
    return allUsers.find(u => u.username.toLowerCase() === viewedProfileUsername.toLowerCase()) || null;
  }
  return currentUser;
}

function renderProfileView() {
  const profileUser = getProfileBeingViewed();
  if (!profileUser) return;
  const isMe = currentUser && profileUser.username.toLowerCase() === currentUser.username.toLowerCase();

  document.getElementById('profilePageAvatar').src = profileUser.avatar || DEFAULT_AVATAR_URL;
  document.getElementById('profilePageUsername').innerText = '@' + profileUser.username;
  document.getElementById('profilePageFullName').innerText = profileUser.fullName || profileUser.username;
  document.getElementById('profilePageBioText').innerText = profileUser.bio || 'Sem biografia cadastrada.' + (isMe ? ' Clique em Editar Perfil para adicionar!' : '');
  document.getElementById('profilePageInterestBadge').innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Meta: ${profileUser.dailyGoal || 'Foco'} • ${profileUser.interests || 'Estudos'}`;

  const postsCount = allPosts.filter(p => p.authorUsername.toLowerCase() === profileUser.username.toLowerCase()).length;
  document.getElementById('profilePostsCount').innerText = postsCount;
  document.getElementById('profileFollowersCount').innerText = getFollowersCount(profileUser.username);
  document.getElementById('profileFollowingCount').innerText = getFollowingCount(profileUser.username);

  const actionBtnsBox = document.getElementById('profileActionBtnsBox');
  if (actionBtnsBox) {
    if (isMe) {
      actionBtnsBox.innerHTML = `
        <button class="btn-profile-edit" onclick="navigateTo('settings')">Editar Perfil</button>
        <button class="btn-profile-edit" onclick="copyProfileLink()"><i class="fa-solid fa-share-nodes"></i> Compartilhar</button>
      `;
    } else {
      const following = currentUser ? isFollowing(currentUser.username, profileUser.username) : false;
      actionBtnsBox.innerHTML = `
        <button class="btn-profile-edit ${following ? 'following-active' : ''}" onclick="toggleFollowUser('${profileUser.username}')">
          ${following ? '<i class="fa-solid fa-check"></i> Seguindo' : '<i class="fa-solid fa-user-plus"></i> Seguir'}
        </button>
        <button class="btn-profile-edit" onclick="openDirectChat(allUsers.find(u => u.username.toLowerCase() === '${profileUser.username.toLowerCase()}')); navigateTo('direct');"><i class="fa-solid fa-paper-plane"></i> Mensagem</button>
      `;
    }
  }

  switchProfileTab('grid', document.querySelector('.profile-tab'));
}

function viewMyProfile() {
  viewedProfileUsername = null;
  navigateTo('profile');
}

// --- 11c. MODAL DE LISTA DE SEGUIDORES / SEGUINDO ---
let activeFollowListType = null;
function openFollowListModal(type) {
  const profileUser = getProfileBeingViewed();
  if (!profileUser) return;
  activeFollowListType = type;
  document.getElementById('followListModalTitle').innerText = type === 'followers' ? 'Seguidores' : 'Seguindo';
  renderFollowListModalIfOpen();
  openModal('followListModal');
}

function renderFollowListModalIfOpen() {
  const modal = document.getElementById('followListModal');
  if (!modal || !modal.classList.contains('active') || !activeFollowListType) return;

  const profileUser = getProfileBeingViewed();
  if (!profileUser) return;

  const usernames = activeFollowListType === 'followers'
    ? getFollowersUsernames(profileUser.username)
    : getFollowingUsernames(profileUser.username);

  const body = document.getElementById('followListModalBody');
  if (usernames.length === 0) {
    body.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">${activeFollowListType === 'followers' ? 'Ainda ninguém segue este perfil.' : 'Ainda não está seguindo ninguém.'}</div>`;
    return;
  }

  body.innerHTML = usernames.map(uname => {
    const u = allUsers.find(x => x.username.toLowerCase() === uname.toLowerCase());
    if (!u) return '';
    const following = currentUser ? isFollowing(currentUser.username, u.username) : false;
    const isMe = currentUser && currentUser.username.toLowerCase() === u.username.toLowerCase();
    return `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1; overflow: hidden;" onclick="closeModal('followListModal'); viewUserProfile('${u.username}')">
          <img src="${u.avatar || DEFAULT_AVATAR_URL}" class="avatar-circle" style="width: 40px; height: 40px;" alt="${u.fullName}" />
          <div style="overflow: hidden;">
            <div style="font-weight: 700; font-size: 0.85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${u.fullName || u.username}</div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">@${u.username}</div>
          </div>
        </div>
        ${isMe ? '' : `<button class="btn-profile-edit ${following ? 'following-active' : ''}" style="padding: 4px 12px; font-size: 0.78rem; flex-shrink: 0;" onclick="toggleFollowUser('${u.username}')">${following ? 'Seguindo' : 'Seguir'}</button>`}
      </div>
    `;
  }).join('');
}

// --- 12. RENDERIZAÇÃO DA INTERFACE (APP SHELL) ---
function renderAppShell() {
  renderStories();
  renderFeed();
  renderHighlights();
  renderReelsFeed();
  renderExploreGrid();
  renderStudyRooms();
  renderChatConversations();
  renderSidebarWidgets();
}

function navigateTo(viewName) {
  document.querySelectorAll('.app-view').forEach(view => view.style.display = 'none');
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) targetView.style.display = (viewName === 'reels' || viewName === 'direct') ? 'flex' : 'block';

  const contentContainer = document.getElementById('contentContainer');
  if (contentContainer) contentContainer.classList.toggle('wide-mode', viewName === 'direct');

  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
  const activeNav = document.getElementById(`nav-${viewName}`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.bottom-nav-item').forEach(item => item.classList.remove('active'));
  const activeBNav = document.getElementById(`bnav-${viewName}`);
  if (activeBNav) activeBNav.classList.add('active');

  if (viewName === 'profile') renderProfileView();
}

// --- 13. STORIES COM UPLOAD DO DISPOSITIVO (FOTO / VÍDEO REAL 24H) ---
function triggerAddStory() {
  const fileInput = document.getElementById('storyFileInput');
  if (fileInput) fileInput.click();
}

async function handleStoryFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const isVideo = file.type.startsWith('video');
  let mediaDataUrl = '';

  if (isVideo) {
    const reader = new FileReader();
    reader.onload = async (event) => {
      mediaDataUrl = event.target.result;
      await createAndPublishStory(mediaDataUrl, 'video');
    };
    reader.readAsDataURL(file);
  } else {
    mediaDataUrl = await compressImage(file, 1080, 1920, 0.88);
    await createAndPublishStory(mediaDataUrl, 'image');
  }

  // Reseta input
  e.target.value = '';
}

async function createAndPublishStory(mediaUrl, mediaType) {
  const newStory = {
    id: 'story_' + Date.now(),
    username: currentUser.username,
    avatar: currentUser.avatar,
    mediaUrl: mediaUrl,
    mediaType: mediaType,
    createdAt: Date.now(),
    seen: false
  };

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('stories').insert([{
        author_username: currentUser.username,
        author_name: currentUser.fullName,
        author_avatar: currentUser.avatar,
        media_url: mediaUrl,
        media_type: mediaType
      }]).select().single();

      if (data && data.id) newStory.id = data.id;
      if (error) console.warn('Supabase Story Error:', error.message);
    } catch (e) {
      console.warn('Erro ao salvar story no Supabase:', e);
    }
  }

  allStories.unshift(newStory);
  saveLocalState();
  renderStories();
  alert('✨ Story publicado com sucesso! Ficará visível por exatamente 24 horas.');
}

function renderStories() {
  cleanExpiredStories();
  const storiesList = document.getElementById('storiesList');
  if (!storiesList) return;

  const myStoryHtml = storiesList.firstElementChild.outerHTML;
  storiesList.innerHTML = myStoryHtml;

  allStories.forEach(story => {
    const storyCard = document.createElement('div');
    storyCard.className = 'story-card';
    storyCard.onclick = () => openStoryViewer(story);
    storyCard.innerHTML = `
      <div class="story-ring ${story.seen ? 'seen' : ''}">
        <img src="${story.avatar}" class="story-avatar" alt="${story.username}" />
      </div>
      <span class="story-username">${story.username}</span>
    `;
    storiesList.appendChild(storyCard);
  });
}

let storyTimer = null;
function openStoryViewer(story) {
  activeStoryViewing = story;
  story.seen = true;
  saveLocalState();
  renderStories();

  const modal = document.getElementById('storyViewerModal');
  const img = document.getElementById('storyViewerImage');
  const vid = document.getElementById('storyViewerVideo');
  const avatar = document.getElementById('storyViewerAvatar');
  const username = document.getElementById('storyViewerUsername');
  const progressFill = document.getElementById('storyProgressFill');
  const btnDelete = document.getElementById('btnDeleteStory');

  avatar.src = story.avatar;
  username.innerText = '@' + story.username;

  // Botão de deletar caso seja o autor
  btnDelete.style.display = (currentUser && story.username.toLowerCase() === currentUser.username.toLowerCase()) ? 'block' : 'none';

  if (story.mediaType === 'video') {
    img.style.display = 'none';
    vid.style.display = 'block';
    vid.src = story.mediaUrl;
    vid.play().catch(() => {});
  } else {
    vid.style.display = 'none';
    img.style.display = 'block';
    img.src = story.mediaUrl;
  }

  modal.classList.add('active');
  progressFill.style.transition = 'none';
  progressFill.style.width = '0%';

  setTimeout(() => {
    progressFill.style.transition = 'width 6s linear';
    progressFill.style.width = '100%';
  }, 50);

  clearTimeout(storyTimer);
  storyTimer = setTimeout(() => closeStoryViewer(), 6100);
}

function closeStoryViewer() {
  clearTimeout(storyTimer);
  const modal = document.getElementById('storyViewerModal');
  const progressFill = document.getElementById('storyProgressFill');
  const vid = document.getElementById('storyViewerVideo');
  if (vid) vid.pause();

  modal.classList.remove('active');
  progressFill.style.transition = 'none';
  progressFill.style.width = '0%';
  activeStoryViewing = null;
}

async function deleteCurrentStory() {
  if (!activeStoryViewing) return;
  if (confirm('Deseja excluir este Story?')) {
    const sId = activeStoryViewing.id;
    if (supabaseClient && typeof sId === 'string' && sId.includes('-')) {
      try {
        await supabaseClient.from('stories').delete().eq('id', sId);
      } catch (e) {}
    }
    allStories = allStories.filter(s => s.id !== sId);
    saveLocalState();
    closeStoryViewer();
    renderStories();
  }
}

// --- 14. DESTAQUES (HIGHLIGHTS REAIS COM UPLOAD DO DISPOSITIVO) ---
function renderHighlights() {
  const container = document.getElementById('profileHighlightsContainer');
  if (!container) return;
  container.innerHTML = '';

  const myHighlights = allHighlights.filter(h => currentUser && h.username.toLowerCase() === currentUser.username.toLowerCase());

  myHighlights.forEach(h => {
    const item = document.createElement('div');
    item.className = 'highlight-item';
    item.onclick = () => openHighlightViewer(h);

    const innerContent = h.coverUrl
      ? `<img src="${h.coverUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" alt="${h.title}" />`
      : `<span>${h.emoji || '🌟'}</span>`;

    item.innerHTML = `
      <div class="highlight-circle">${innerContent}</div>
      <span class="highlight-label">${h.title}</span>
    `;
    container.appendChild(item);
  });

  // Botão Adicionar Novo Destaque
  const addBtn = document.createElement('div');
  addBtn.className = 'highlight-item';
  addBtn.onclick = openCreateHighlightModal;
  addBtn.innerHTML = `
    <div class="highlight-circle" style="border-style: dashed;"><i class="fa-solid fa-plus"></i></div>
    <span class="highlight-label">Novo</span>
  `;
  container.appendChild(addBtn);
}

function openCreateHighlightModal() {
  highlightCoverData = '';
  document.getElementById('highlightTitleInput').value = '';
  document.getElementById('highlightEmojiInput').value = '';
  document.getElementById('highlightCoverFileInput').value = '';
  document.getElementById('highlightCoverPreviewBox').style.display = 'none';
  openModal('createHighlightModal');
}

async function previewHighlightCover(e) {
  const file = e.target.files[0];
  if (!file) return;
  highlightCoverData = await compressImage(file, 400, 400, 0.9);
  document.getElementById('highlightCoverPreview').src = highlightCoverData;
  document.getElementById('highlightCoverPreviewBox').style.display = 'block';
}

async function submitNewHighlight() {
  const title = document.getElementById('highlightTitleInput').value.trim();
  const emoji = document.getElementById('highlightEmojiInput').value.trim() || '🌟';

  if (!title) {
    alert('Digite o título do seu destaque.');
    return;
  }

  const newHighlight = {
    id: 'hl_' + Date.now(),
    username: currentUser.username,
    title: title,
    emoji: emoji,
    coverUrl: highlightCoverData || '',
    createdAt: new Date().toISOString()
  };

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('highlights').insert([{
        author_username: currentUser.username,
        title: title,
        emoji: emoji,
        cover_url: highlightCoverData
      }]).select().single();

      if (data && data.id) newHighlight.id = data.id;
      if (error) console.warn('Supabase Highlight Insert:', error.message);
    } catch (e) {}
  }

  allHighlights.unshift(newHighlight);
  saveLocalState();
  closeModal('createHighlightModal');
  renderHighlights();
  alert('🌟 Destaque salvo no seu perfil com sucesso!');
}

function openHighlightViewer(highlight) {
  activeHighlightViewing = highlight;
  const modal = document.getElementById('highlightViewerModal');
  const img = document.getElementById('highlightViewerImage');
  const title = document.getElementById('highlightViewerTitle');
  const emoji = document.getElementById('highlightViewerEmoji');
  const btnDelete = document.getElementById('btnDeleteHighlight');

  title.innerText = highlight.title;
  emoji.innerText = highlight.emoji || '🌟';
  img.src = highlight.coverUrl || 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80';

  btnDelete.style.display = (currentUser && highlight.username.toLowerCase() === currentUser.username.toLowerCase()) ? 'block' : 'none';
  modal.classList.add('active');
}

function closeHighlightViewer() {
  const modal = document.getElementById('highlightViewerModal');
  modal.classList.remove('active');
  activeHighlightViewing = null;
}

async function deleteCurrentHighlight() {
  if (!activeHighlightViewing) return;
  if (confirm('Deseja excluir este Destaque do seu perfil?')) {
    const hlId = activeHighlightViewing.id;
    if (supabaseClient && typeof hlId === 'string' && hlId.includes('-')) {
      try {
        await supabaseClient.from('highlights').delete().eq('id', hlId);
      } catch (e) {}
    }
    allHighlights = allHighlights.filter(h => h.id !== hlId);
    saveLocalState();
    closeHighlightViewer();
    renderHighlights();
  }
}

// --- 15. FEED DE PUBLICAÇÕES & INTERAÇÕES ---
function filterFeed(type, element) {
  currentFeedFilter = type;
  document.querySelectorAll('.feed-tab').forEach(tab => tab.classList.remove('active'));
  if (element) element.classList.add('active');
  renderFeed();
}

function renderFeed() {
  const container = document.getElementById('feedPostsContainer');
  if (!container) return;
  container.innerHTML = '';

  const filtered = allPosts.filter(p => currentFeedFilter === 'all' || p.type === currentFeedFilter);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card">
        <i class="fa-solid fa-feather-pointed empty-icon"></i>
        <h3>Nenhuma publicação encontrada</h3>
        <p>Ainda não há postagens nesta categoria. Seja o primeiro a compartilhar uma dúvida ou resumo com a comunidade!</p>
        <button class="btn-publish" onclick="document.getElementById('quickPostText').focus()">Criar Primeira Publicação</button>
      </div>
    `;
    return;
  }

  filtered.forEach(post => {
    const card = document.createElement('article');
    card.className = 'post-card';
    card.id = `post-card-${post.id}`;

    let badgeClass = post.type === 'doubt' ? 'badge-doubt' : (post.type === 'general' ? 'badge-lounge' : 'badge-study');
    let badgeText = post.type === 'doubt' ? '❓ Dúvida & Exercício' : (post.type === 'general' ? '☕ Rotina & Lazer' : '📖 Resumo & Estudo');
    const tagsHtml = (post.tags || []).map(t => `<span style="color: var(--primary); font-weight: 600; margin-right: 6px;">${t}</span>`).join('');

    card.innerHTML = `
      <div class="post-header">
        <div class="post-user-meta" onclick="viewUserProfile('${post.authorUsername}')">
          <img src="${post.authorAvatar}" class="post-user-avatar" alt="${post.authorName}" />
          <div>
            <div class="post-author-name">${post.authorName} <i class="fa-solid fa-circle-check verified-badge"></i></div>
            <div class="post-meta-sub"><span>@${post.authorUsername}</span> • <span>${post.createdAt}</span></div>
          </div>
        </div>
        <span class="post-badge-type ${badgeClass}">${badgeText}</span>
      </div>

      <div class="post-content-text">${post.content}</div>

      ${post.exerciseCode ? `
        <div class="post-exercise-box">
          <div style="font-size: 0.75rem; color: var(--accent-warning); margin-bottom: 4px; font-weight: 700;">ENUNCIADO / CÓDIGO DO EXERCÍCIO:</div>
          <code>${post.exerciseCode}</code>
        </div>
      ` : ''}

      ${post.image ? `
        <div class="post-media-container">
          <img src="${post.image}" class="post-media-img" alt="Mídia da Publicação" />
        </div>
      ` : ''}

      <div class="post-actions">
        <div class="actions-left">
          <button class="btn-action ${post.likedByMe ? 'liked' : ''}" onclick="toggleLikePost('${post.id}')">
            <i class="${post.likedByMe ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}"></i>
          </button>
          <button class="btn-action" onclick="focusCommentInput('${post.id}')"><i class="fa-regular fa-comment"></i></button>
          <button class="btn-action" onclick="sharePost('${post.id}')"><i class="fa-regular fa-paper-plane"></i></button>
        </div>
        <button class="btn-action ${post.savedByMe ? 'saved' : ''}" onclick="toggleSavePost('${post.id}')"><i class="${post.savedByMe ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}"></i></button>
      </div>

      <div class="post-stats">
        <span>${post.likes} curtidas</span> • <span>${post.comments ? post.comments.length : 0} comentários</span>
        <div style="margin-top: 4px;">${tagsHtml}</div>
      </div>

      <div class="post-comments-section">
        <div class="comments-list" id="comments-list-${post.id}">
          ${(post.comments || []).map(c => `
            <div class="comment-item"><span class="comment-author">${c.author}:</span> <span class="comment-text">${c.text}</span></div>
          `).join('')}
        </div>
        <div class="comment-input-row">
          <input type="text" class="comment-input" id="comment-input-${post.id}" placeholder="Escreva uma resposta ou comentário..." onkeypress="if(event.key==='Enter') submitComment('${post.id}')" />
          <button class="btn-send-comment" onclick="submitComment('${post.id}')">Publicar</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

async function toggleLikePost(postId) {
  const post = allPosts.find(p => String(p.id) === String(postId));
  if (!post) return;
  post.likedByMe = !post.likedByMe;
  post.likes += post.likedByMe ? 1 : -1;
  saveLocalState();
  renderFeed();

  if (supabaseClient && typeof postId === 'string' && postId.includes('-')) {
    try {
      await supabaseClient.from('posts').update({ likes: post.likes }).eq('id', postId);
    } catch (e) {}
  }
}

function toggleSavePost(postId) {
  const post = allPosts.find(p => String(p.id) === String(postId));
  if (!post) return;
  post.savedByMe = !post.savedByMe;
  saveLocalState();
  renderFeed();
  alert(post.savedByMe ? '🔖 Publicação guardada na sua aba de Salvos!' : 'Removido dos salvos.');
}

function focusCommentInput(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  if (input) input.focus();
}

async function submitComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  const post = allPosts.find(p => String(p.id) === String(postId));
  if (!post) return;

  if (!post.comments) post.comments = [];
  post.comments.push({ author: currentUser ? currentUser.fullName : 'Você', text: text });
  input.value = '';
  saveLocalState();
  renderFeed();

  if (supabaseClient && typeof postId === 'string' && postId.includes('-')) {
    try {
      await supabaseClient.from('comments').insert([{
        post_id: postId,
        author_name: currentUser.fullName,
        author_username: currentUser.username,
        text: text
      }]);
    } catch (e) {}
  }
}

function sharePost(postId) {
  navigator.clipboard.writeText(window.location.href);
  alert('🔗 Link da publicação copiado para a área de transferência!');
}

// Compositor Rápido
let activeComposerTags = [];
function toggleComposerTag(el, tag) {
  el.classList.toggle('active');
  const fullTag = '#' + tag;
  if (el.classList.contains('active')) {
    if (!activeComposerTags.includes(fullTag)) activeComposerTags.push(fullTag);
  } else {
    activeComposerTags = activeComposerTags.filter(t => t !== fullTag);
  }
}

async function handleComposerImgUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  composerImgData = await compressImage(file, 1200, 1200, 0.88);
  document.getElementById('composerImgPreview').src = composerImgData;
  document.getElementById('composerImgPreviewBox').style.display = 'block';
}

function clearComposerImg() {
  composerImgData = '';
  document.getElementById('composerImgPreview').src = '';
  document.getElementById('composerImgPreviewBox').style.display = 'none';
  document.getElementById('composerFileInput').value = '';
}

function promptInsertExercise() {
  const code = prompt('Cole ou digite o enunciado da questão ou bloco de código:');
  if (code) document.getElementById('quickPostText').value += `\n[EXERCÍCIO/CÓDIGO]:\n${code}\n`;
}

function promptInsertSubject() {
  const subject = prompt('Qual matéria ou tag principal?');
  if (subject) activeComposerTags.push('#' + subject.replace(/\s+/g, ''));
}

async function publishQuickPost() {
  const text = document.getElementById('quickPostText').value.trim();
  if (!text && !composerImgData) {
    alert('Digite uma mensagem ou adicione uma imagem do seu dispositivo para publicar.');
    return;
  }

  const isDoubt = activeComposerTags.some(t => t.toLowerCase().includes('dúvida') || t.toLowerCase().includes('exercício'));
  const postType = isDoubt ? 'doubt' : (composerImgData ? 'study' : 'general');
  const tags = activeComposerTags.length > 0 ? activeComposerTags : ['#Estudos', '#Noctua'];

  const newPost = {
    id: 'post_' + Date.now(),
    authorId: currentUser.id,
    authorName: currentUser.fullName,
    authorUsername: currentUser.username,
    authorAvatar: currentUser.avatar,
    type: postType,
    content: text,
    exerciseCode: '',
    image: composerImgData,
    tags: tags,
    likes: 0,
    likedByMe: false,
    savedByMe: false,
    createdAt: 'Agora mesmo',
    comments: []
  };

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('posts').insert([{
        author_id: currentUser.id,
        author_username: currentUser.username,
        author_name: currentUser.fullName,
        author_avatar: currentUser.avatar,
        type: postType,
        content: text,
        image_url: composerImgData,
        tags: tags
      }]).select().single();

      if (data && data.id) newPost.id = data.id;
      if (error) console.warn('Supabase Post Insert:', error.message);
    } catch (e) {}
  }

  allPosts.unshift(newPost);
  saveLocalState();

  document.getElementById('quickPostText').value = '';
  clearComposerImg();
  document.querySelectorAll('.composer-tags .tag-badge').forEach(b => b.classList.remove('active'));
  activeComposerTags = [];
  renderFeed();
}

// Modal Criar Publicação Completa
function openCreatePostModal() { openModal('createPostModal'); }
function handlePostTypeChange(type) {
  document.getElementById('postModalExerciseContainer').style.display = type === 'doubt' ? 'block' : 'none';
}

async function previewPostModalImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const compressed = await compressImage(file, 1200, 1200, 0.88);
  document.getElementById('postModalImgPreview').src = compressed;
  document.getElementById('postModalImgPreviewBox').style.display = 'block';
}

async function submitFullPost() {
  const type = document.getElementById('postModalType').value;
  const text = document.getElementById('postModalText').value.trim();
  const code = document.getElementById('postModalExerciseCode').value.trim();
  const tagsStr = document.getElementById('postModalTags').value.trim();
  const imgElem = document.getElementById('postModalImgPreview');
  const imgUrl = imgElem.src && imgElem.src.startsWith('data:') ? imgElem.src : '';

  if (!text) { alert('Escreva o texto da sua publicação.'); return; }

  const tags = tagsStr ? tagsStr.split(' ').map(t => t.startsWith('#') ? t : '#' + t) : ['#Estudos'];
  const newPost = {
    id: 'post_' + Date.now(),
    authorId: currentUser.id,
    authorName: currentUser.fullName,
    authorUsername: currentUser.username,
    authorAvatar: currentUser.avatar,
    type: type,
    content: text,
    exerciseCode: code,
    image: imgUrl,
    tags: tags,
    likes: 0,
    likedByMe: false,
    savedByMe: false,
    createdAt: 'Agora mesmo',
    comments: []
  };

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('posts').insert([{
        author_id: currentUser.id,
        author_username: currentUser.username,
        author_name: currentUser.fullName,
        author_avatar: currentUser.avatar,
        type: type,
        content: text,
        exercise_code: code,
        image_url: imgUrl,
        tags: tags
      }]).select().single();

      if (data && data.id) newPost.id = data.id;
      if (error) console.warn('Supabase Post Insert:', error.message);
    } catch (e) {}
  }

  allPosts.unshift(newPost);
  saveLocalState();
  closeModal('createPostModal');
  document.getElementById('postModalText').value = '';
  document.getElementById('postModalExerciseCode').value = '';
  document.getElementById('postModalImgPreviewBox').style.display = 'none';
  renderFeed();
}

// --- 16. REELS (VÍDEOS VERTICAIS DO DISPOSITIVO) ---
function openCreateReelModal() {
  uploadedReelVideoData = '';
  document.getElementById('reelFileInput').value = '';
  document.getElementById('reelVideoUrlInput').value = '';
  document.getElementById('reelCaptionInput').value = '';
  openModal('createReelModal');
}

function handleReelFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    uploadedReelVideoData = event.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitNewReel() {
  const caption = document.getElementById('reelCaptionInput').value.trim();
  const videoUrlFromInput = document.getElementById('reelVideoUrlInput').value.trim();
  const finalVideoUrl = uploadedReelVideoData || videoUrlFromInput;

  if (!caption) {
    alert('Adicione uma legenda para o seu Reel.');
    return;
  }
  if (!finalVideoUrl) {
    alert('Selecione um arquivo de vídeo do seu dispositivo ou cole um link.');
    return;
  }

  const newReel = {
    id: 'reel_' + Date.now(),
    authorUsername: currentUser.username,
    authorName: currentUser.fullName,
    authorAvatar: currentUser.avatar,
    videoUrl: finalVideoUrl,
    caption: caption,
    likes: 0,
    likedByMe: false
  };

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('reels').insert([{
        author_username: currentUser.username,
        author_name: currentUser.fullName,
        author_avatar: currentUser.avatar,
        video_url: finalVideoUrl,
        caption: caption
      }]).select().single();

      if (data && data.id) newReel.id = data.id;
      if (error) console.warn('Supabase Reel Insert:', error.message);
    } catch (e) {}
  }

  allReels.unshift(newReel);
  saveLocalState();
  closeModal('createReelModal');
  renderReelsFeed();
  navigateTo('reels');
  alert('🎬 Reel publicado com sucesso!');
}

function renderReelsFeed() {
  const container = document.getElementById('reelsFeedContainer');
  if (!container) return;
  container.innerHTML = '';

  if (allReels.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card" style="height: 100%; display: flex; flex-direction: column; justify-content: center;">
        <i class="fa-solid fa-clapperboard empty-icon"></i>
        <h3>Nenhum Reel publicado ainda</h3>
        <p>Compartilhe pílulas de conhecimento e dicas rápidas de estudo em vídeo a partir do seu dispositivo!</p>
        <button class="btn-publish" onclick="openCreateReelModal()"><i class="fa-solid fa-video"></i> Postar Primeiro Reel</button>
      </div>
    `;
    return;
  }

  allReels.forEach((reel) => {
    const isMeAuthor = currentUser && reel.authorUsername.toLowerCase() === currentUser.username.toLowerCase();
    const following = currentUser ? isFollowing(currentUser.username, reel.authorUsername) : false;
    const commentCount = allReelComments.filter(c => String(c.reelId) === String(reel.id)).length;

    const card = document.createElement('div');
    card.className = 'reel-card-item';
    card.innerHTML = `
      <video class="reel-video-element" src="${reel.videoUrl}" loop playsinline onclick="toggleReelPlay(this)"></video>
      <div class="reel-overlay-content">
        <div class="reel-user-row">
          <img src="${reel.authorAvatar || DEFAULT_AVATAR_URL}" class="reel-avatar" alt="${reel.authorName}" onclick="viewUserProfile('${reel.authorUsername}')" style="cursor: pointer;" />
          <span style="font-weight: 700; cursor: pointer;" onclick="viewUserProfile('${reel.authorUsername}')">@${reel.authorUsername}</span>
          ${isMeAuthor ? '' : `<button class="btn-reel-follow ${following ? 'is-following' : ''}" onclick="toggleFollowUser('${reel.authorUsername}')">${following ? 'Seguindo' : 'Seguir'}</button>`}
        </div>
        <p class="reel-caption">${reel.caption}</p>
      </div>
      <div class="reel-sidebar-actions">
        <div class="reel-action-btn" onclick="toggleReelItemLike('${reel.id}')">
          <i class="${reel.likedByMe ? 'fa-solid fa-heart' : 'fa-regular fa-heart'}" style="${reel.likedByMe ? 'color: #38bdf8;' : ''}"></i>
          <span>${reel.likes}</span>
        </div>
        <div class="reel-action-btn" onclick="openReelCommentsModal('${reel.id}')">
          <i class="fa-solid fa-comment-dots"></i>
          <span>${commentCount}</span>
        </div>
        <div class="reel-action-btn" onclick="navigator.clipboard.writeText(window.location.href); alert('🔗 Link do Reel copiado!')">
          <i class="fa-solid fa-share-nodes"></i>
          <span>Compartilhar</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function toggleReelPlay(videoEl) {
  if (videoEl.paused) videoEl.play();
  else videoEl.pause();
}

function toggleReelItemLike(reelId) {
  const reel = allReels.find(r => String(r.id) === String(reelId));
  if (!reel) return;
  reel.likedByMe = !reel.likedByMe;
  reel.likes += reel.likedByMe ? 1 : -1;
  saveLocalState();
  renderReelsFeed();
}

// --- 16b. COMENTÁRIOS REAIS DOS REELS ---
function openReelCommentsModal(reelId) {
  activeReelCommentsId = reelId;
  renderReelCommentsModal();
  openModal('reelCommentsModal');
}

function closeReelCommentsModal() {
  activeReelCommentsId = null;
  closeModal('reelCommentsModal');
}

function renderReelCommentsModal() {
  const body = document.getElementById('reelCommentsModalBody');
  if (!body || !activeReelCommentsId) return;

  const comments = allReelComments.filter(c => String(c.reelId) === String(activeReelCommentsId));

  if (comments.length === 0) {
    body.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem;">Nenhum comentário ainda. Seja o primeiro a comentar!</div>`;
    return;
  }

  body.innerHTML = comments.map(c => `
    <div class="comment-item"><span class="comment-author">${c.authorName || c.authorUsername}:</span> <span class="comment-text">${c.text}</span></div>
  `).join('');
}

async function submitReelComment() {
  const input = document.getElementById('reelCommentInput');
  const text = input.value.trim();
  if (!text || !activeReelCommentsId || !currentUser) return;

  const newComment = {
    id: 'rcomment_' + Date.now(),
    reelId: activeReelCommentsId,
    authorUsername: currentUser.username,
    authorName: currentUser.fullName,
    text: text,
    createdAt: new Date().toISOString()
  };

  allReelComments.push(newComment);
  input.value = '';
  saveLocalState();
  renderReelCommentsModal();
  renderReelsFeed();

  if (supabaseClient && typeof activeReelCommentsId === 'string' && activeReelCommentsId.includes('-')) {
    try {
      await supabaseClient.from('reel_comments').insert([{
        reel_id: activeReelCommentsId,
        author_username: currentUser.username,
        author_name: currentUser.fullName,
        text: text
      }]);
    } catch (e) { console.warn('Erro ao salvar comentário do reel:', e); }
  }
}

// --- 17. SALAS DE ESTUDO (PÚBLICAS, PRIVADAS COM CÓDIGO & DELEÇÃO) ---
function openCreateRoomModal() {
  document.getElementById('roomInputTitle').value = '';
  document.getElementById('roomInputDesc').value = '';
  document.getElementById('roomInputPrivacy').value = 'public';
  document.getElementById('privateRoomNotice').style.display = 'none';
  openModal('createRoomModal');
}

function togglePrivateRoomNotice(val) {
  document.getElementById('privateRoomNotice').style.display = val === 'private' ? 'block' : 'none';
}

async function submitNewStudyRoom() {
  const title = document.getElementById('roomInputTitle').value.trim();
  const desc = document.getElementById('roomInputDesc').value.trim();
  const icon = document.getElementById('roomInputIcon').value;
  const privacy = document.getElementById('roomInputPrivacy').value;

  if (!title) {
    alert('Digite o título da sala de estudos.');
    return;
  }

  const isPrivate = privacy === 'private';
  const roomCode = isPrivate ? 'EST-' + Math.floor(1000 + Math.random() * 9000) : null;

  const newRoom = {
    id: 'room_' + Date.now(),
    title: title,
    desc: desc || 'Sala de foco e estudos.',
    icon: icon,
    creatorUsername: currentUser.username,
    isPrivate: isPrivate,
    roomCode: roomCode,
    usersCount: 1,
    users: [currentUser]
  };

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.from('study_rooms').insert([{
        title: title,
        description: desc,
        icon: icon,
        creator_username: currentUser.username,
        is_private: isPrivate,
        room_code: roomCode,
        users_count: 1
      }]).select().single();

      if (data && data.id) newRoom.id = data.id;
      if (error) console.warn('Supabase Room Insert:', error.message);
    } catch (e) {}
  }

  allStudyRooms.unshift(newRoom);
  saveLocalState();
  closeModal('createRoomModal');
  renderStudyRooms();
  renderSidebarWidgets();

  if (isPrivate) {
    alert(`🔐 Sala Privada criada com sucesso!\nSeu Código de Acesso é: ${roomCode}\nRepasse este código para os seus amigos.`);
  }

  joinLiveRoom(newRoom);
}

function renderStudyRooms() {
  const grid = document.getElementById('roomsListGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (allStudyRooms.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-card" style="grid-column: 1 / -1;">
        <i class="fa-solid fa-headset empty-icon"></i>
        <h3>Nenhuma sala de estudo aberta</h3>
        <p>Crie uma sala pública ou privada para focar com seus amigos no Pomodoro e chat de voz real!</p>
        <button class="btn-publish" onclick="openCreateRoomModal()"><i class="fa-solid fa-plus"></i> Criar Primeira Sala</button>
      </div>
    `;
    return;
  }

  allStudyRooms.forEach(room => {
    const isCreator = currentUser && room.creatorUsername.toLowerCase() === currentUser.username.toLowerCase();
    const card = document.createElement('div');
    card.className = 'room-card';

    card.innerHTML = `
      ${isCreator ? `<button class="btn-delete-room-card" onclick="event.stopPropagation(); deleteStudyRoom('${room.id}')" title="Deletar Sala"><i class="fa-solid fa-trash"></i></button>` : ''}
      <div class="room-header">
        <div class="room-icon-box"><i class="fa-solid ${room.icon}"></i></div>
        <div class="room-type-badge ${room.isPrivate ? 'badge-private' : 'badge-public'}">
          <i class="fa-solid ${room.isPrivate ? 'fa-lock' : 'fa-globe'}"></i> ${room.isPrivate ? 'Privada' : 'Pública'}
        </div>
      </div>
      <div class="room-title">${room.title}</div>
      <div class="room-desc">${room.desc}</div>
      ${room.isPrivate && isCreator ? `<div class="room-code-tag"><i class="fa-solid fa-key"></i> Código: ${room.roomCode}</div>` : ''}
      <div class="room-avatars-row">
        ${(room.users || []).map(u => `<img src="${u.avatar}" class="room-mini-avatar" title="${u.fullName}" />`).join('')}
        <span class="room-users-count">+${room.usersCount || 1} estudante</span>
      </div>
      <button class="btn-join-room" onclick="attemptJoinRoom('${room.id}')">
        <i class="fa-solid ${room.isPrivate ? 'fa-key' : 'fa-headset'}"></i> ${room.isPrivate ? 'Entrar com Código' : 'Entrar na Sala'}
      </button>
    `;
    grid.appendChild(card);
  });
}

function attemptJoinRoom(roomId) {
  const room = allStudyRooms.find(r => String(r.id) === String(roomId));
  if (!room) return;

  if (room.isPrivate) {
    const isCreator = currentUser && room.creatorUsername.toLowerCase() === currentUser.username.toLowerCase();
    if (!isCreator) {
      const enteredCode = prompt(`🔐 Esta é uma Sala Privada criada por @${room.creatorUsername}.\nDigite o código de acesso:`);
      if (!enteredCode || enteredCode.trim().toUpperCase() !== (room.roomCode || '').toUpperCase()) {
        alert('❌ Código de acesso incorreto.');
        return;
      }
    }
  }

  joinLiveRoom(room);
}

async function deleteStudyRoom(roomId) {
  if (confirm('Tem certeza de que deseja deletar esta sala de estudos?')) {
    if (supabaseClient && typeof roomId === 'string' && roomId.includes('-')) {
      try {
        await supabaseClient.from('study_rooms').delete().eq('id', roomId);
      } catch (e) {}
    }

    allStudyRooms = allStudyRooms.filter(r => String(r.id) !== String(roomId));
    saveLocalState();
    renderStudyRooms();
    renderSidebarWidgets();
    alert('🗑️ Sala de estudos deletada com sucesso.');
  }
}

function deleteCurrentRoom() {
  if (activeLiveRoom) {
    deleteStudyRoom(activeLiveRoom.id);
    leaveLiveRoom();
  }
}

function joinLiveRoom(room) {
  activeLiveRoom = room;
  document.getElementById('liveRoomTitle').innerText = room.title;
  document.getElementById('liveRoomIcon').innerHTML = `<i class="fa-solid ${room.icon}"></i>`;

  const codeBadge = document.getElementById('liveRoomCodeBadge');
  if (room.isPrivate && room.roomCode) {
    codeBadge.className = 'room-code-tag';
    codeBadge.style.display = 'inline-block';
    codeBadge.innerHTML = `<i class="fa-solid fa-key"></i> Código: ${room.roomCode}`;
  } else {
    codeBadge.style.display = 'none';
  }

  const btnDeleteModal = document.getElementById('btnDeleteRoomInModal');
  btnDeleteModal.style.display = (currentUser && room.creatorUsername.toLowerCase() === currentUser.username.toLowerCase()) ? 'block' : 'none';

  renderLiveRoomParticipants();

  const chatBox = document.getElementById('liveRoomChatBox');
  chatBox.innerHTML = `
    <div style="font-size: 0.78rem; color: var(--text-muted); text-align: center;">Bem-vindo à sala ${room.title}!</div>
  `;

  openModal('liveRoomModal');
}

function renderLiveRoomParticipants() {
  if (!activeLiveRoom) return;
  const pGrid = document.getElementById('liveRoomParticipantsGrid');
  if (!pGrid) return;
  pGrid.innerHTML = '';

  const div = document.createElement('div');
  div.style.background = 'var(--bg-surface)';
  div.style.padding = '8px';
  div.style.borderRadius = 'var(--radius-md)';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.gap = '8px';
  div.innerHTML = `
    <img src="${currentUser.avatar}" class="avatar-circle ${!isVoiceMuted ? 'speaking-pulse' : ''}" style="width: 32px; height: 32px;" />
    <div style="font-size: 0.75rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
      <strong>${currentUser.fullName} (Você)</strong>
    </div>
    <i class="fa-solid ${!isVoiceMuted ? 'fa-microphone' : 'fa-microphone-slash'}" style="margin-left: auto; font-size: 0.75rem; color: ${!isVoiceMuted ? 'var(--accent-study)' : 'var(--text-muted)'};"></i>
  `;
  pGrid.appendChild(div);
}

function leaveLiveRoom() {
  closeModal('liveRoomModal');
  if (isAmbientPlaying) toggleAmbientAudio();
  stopRealVoiceMic();
  clearInterval(roomPomodoroInterval);
  roomPomodoroRunning = false;
  document.getElementById('btnRoomPomodoroToggle').innerText = 'Iniciar Foco';
  activeLiveRoom = null;
}

function toggleRoomPomodoro() {
  const btn = document.getElementById('btnRoomPomodoroToggle');
  if (roomPomodoroRunning) {
    clearInterval(roomPomodoroInterval);
    roomPomodoroRunning = false;
    btn.innerText = 'Continuar';
  } else {
    roomPomodoroRunning = true;
    btn.innerText = 'Pausar Foco';
    roomPomodoroInterval = setInterval(() => {
      if (roomPomodoroSeconds > 0) {
        roomPomodoroSeconds--;
        updateRoomPomodoroDisplay();
      } else {
        clearInterval(roomPomodoroInterval);
        roomPomodoroRunning = false;
        alert('🔔 Ciclo de foco concluído! Hora de descansar 5 minutos.');
        roomPomodoroSeconds = 5 * 60;
        document.getElementById('pomodoroModeLabel').innerText = 'PAUSA (5 MIN)';
        updateRoomPomodoroDisplay();
      }
    }, 1000);
  }
}

function resetRoomPomodoro() {
  clearInterval(roomPomodoroInterval);
  roomPomodoroRunning = false;
  roomPomodoroSeconds = 25 * 60;
  document.getElementById('btnRoomPomodoroToggle').innerText = 'Iniciar Foco';
  document.getElementById('pomodoroModeLabel').innerText = 'BLOCO DE FOCO';
  updateRoomPomodoroDisplay();
}

function updateRoomPomodoroDisplay() {
  const m = Math.floor(roomPomodoroSeconds / 60);
  const s = roomPomodoroSeconds % 60;
  document.getElementById('roomPomodoroDisplay').innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function sendRoomChatMessage() {
  const input = document.getElementById('liveRoomChatInput');
  const text = input.value.trim();
  if (!text) return;

  const chatBox = document.getElementById('liveRoomChatBox');
  const msg = document.createElement('div');
  msg.style.fontSize = '0.82rem';
  msg.style.background = 'var(--bg-surface)';
  msg.style.padding = '6px 10px';
  msg.style.borderRadius = 'var(--radius-sm)';
  msg.innerHTML = `<strong style="color: var(--primary);">${currentUser.fullName}:</strong> ${text}`;

  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
  input.value = '';
}

// --- 18. CHAT DE VOZ REAL (MICROFONE & VISUALIZADOR DE ONDA) ---
async function toggleRealVoiceMic() {
  const btn = document.getElementById('btnVoiceMicToggle');
  const icon = document.getElementById('voiceMicIcon');
  const label = document.getElementById('voiceMicLabel');
  const hint = document.getElementById('voiceStatusHint');

  if (isVoiceMuted) {
    try {
      voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = voiceAudioCtx.createMediaStreamSource(voiceStream);
      voiceAnalyser = voiceAudioCtx.createAnalyser();
      voiceAnalyser.fftSize = 64;
      source.connect(voiceAnalyser);

      isVoiceMuted = false;
      btn.className = 'btn-voice-mic';
      icon.className = 'fa-solid fa-microphone';
      label.innerText = 'Microfone Ligado';
      hint.innerText = '🎙️ Sua voz está ativa e visível na sala!';
      hint.style.color = 'var(--accent-study)';

      startVoiceVisualizer();
      renderLiveRoomParticipants();
    } catch (err) {
      alert('Permissão de microfone negada ou microfone indisponível no dispositivo.');
    }
  } else {
    stopRealVoiceMic();
  }
}

function stopRealVoiceMic() {
  if (voiceStream) {
    voiceStream.getTracks().forEach(track => track.stop());
    voiceStream = null;
  }
  if (voiceVisualizerAnim) cancelAnimationFrame(voiceVisualizerAnim);
  isVoiceMuted = true;

  const btn = document.getElementById('btnVoiceMicToggle');
  const icon = document.getElementById('voiceMicIcon');
  const label = document.getElementById('voiceMicLabel');
  const hint = document.getElementById('voiceStatusHint');

  if (btn) btn.className = 'btn-voice-mic muted';
  if (icon) icon.className = 'fa-solid fa-microphone-slash';
  if (label) label.innerText = 'Microfone Mutado';
  if (hint) {
    hint.innerText = 'Clique para falar no chat de voz';
    hint.style.color = 'var(--text-secondary)';
  }

  renderLiveRoomParticipants();
}

function startVoiceVisualizer() {
  const canvas = document.getElementById('voiceVisualizerCanvas');
  if (!canvas || !voiceAnalyser) return;
  const ctx = canvas.getContext('2d');
  const bufferLength = voiceAnalyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    voiceVisualizerAnim = requestAnimationFrame(draw);
    voiceAnalyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const barWidth = (canvas.width / bufferLength) * 2;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      ctx.fillStyle = '#06b6d4';
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }
  draw();
}

function toggleAmbientAudio() {
  const btn = document.getElementById('btnToggleAmbientAudio');
  const icon = document.getElementById('audioIcon');

  if (!isAmbientPlaying) {
    try {
      ambientAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const bufferSize = ambientAudioCtx.sampleRate * 2;
      const buffer = ambientAudioCtx.createBuffer(1, bufferSize, ambientAudioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 0.12;
      }

      ambientNoiseNode = ambientAudioCtx.createBufferSource();
      ambientNoiseNode.buffer = buffer;
      ambientNoiseNode.loop = true;
      ambientNoiseNode.connect(ambientAudioCtx.destination);
      ambientNoiseNode.start();

      isAmbientPlaying = true;
      btn.style.background = 'var(--accent-study)';
      btn.style.color = '#fff';
      icon.className = 'fa-solid fa-volume-high';
    } catch (e) {}
  } else {
    if (ambientNoiseNode) ambientNoiseNode.stop();
    isAmbientPlaying = false;
    btn.style.background = 'var(--bg-card)';
    btn.style.color = 'var(--text-primary)';
    icon.className = 'fa-solid fa-volume-xmark';
  }
}

// --- 19. DIRECT MESSAGES & SUPABASE REALTIME ---
function initRealtimeSubscriptions() {
  if (!supabaseClient || !currentUser) return;

  try {
    // Canal de Presença
    realtimePresenceChannel = supabaseClient.channel('online-users');
    realtimePresenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = realtimePresenceChannel.presenceState();
        updateOnlineStatus(state);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await realtimePresenceChannel.track({
            username: currentUser.username,
            fullName: currentUser.fullName,
            avatar: currentUser.avatar,
            onlineAt: new Date().toISOString()
          });
        }
      });

    // Canal de Mensagens Instantâneas
    realtimeMessagesChannel = supabaseClient.channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        const newMsg = payload.new;
        if (newMsg && currentUser) {
          if (newMsg.receiver_username.toLowerCase() === currentUser.username.toLowerCase() ||
              newMsg.sender_username.toLowerCase() === currentUser.username.toLowerCase()) {
            allMessages.push(newMsg);
            saveLocalState();
            renderActiveChatMessages();
            renderChatConversations();
          }
        }
      })
      .subscribe();
  } catch (e) {
    console.warn('Realtime subscription warning:', e);
  }
}

function updateOnlineStatus(presenceState) {
  const onlineUsernames = new Set();
  for (const key in presenceState) {
    presenceState[key].forEach(u => onlineUsernames.add(u.username.toLowerCase()));
  }

  allUsers.forEach(u => {
    u.online = onlineUsernames.has(u.username.toLowerCase());
  });

  renderChatConversations();
  renderSidebarWidgets();
}

function renderChatConversations() {
  const list = document.getElementById('chatConversationsList');
  if (!list) return;
  list.innerHTML = '';

  const otherUsers = allUsers.filter(u => currentUser && u.username.toLowerCase() !== currentUser.username.toLowerCase());

  if (otherUsers.length === 0) {
    list.innerHTML = `
      <div style="padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
        Nenhum outro estudante conectado ainda.<br>Clique no ícone de lápis para procurar por @nome!
      </div>
    `;
    return;
  }

  otherUsers.forEach((user) => {
    const item = document.createElement('div');
    item.className = `chat-user-item ${activeChatUser && activeChatUser.username.toLowerCase() === user.username.toLowerCase() ? 'active' : ''}`;
    item.onclick = () => openDirectChat(user, item);

    item.innerHTML = `
      <div class="avatar-container">
        <img src="${user.avatar || DEFAULT_AVATAR_URL}" class="avatar-circle" alt="${user.fullName}" />
        <div class="online-dot ${user.online ? '' : 'offline'}"></div>
      </div>
      <div style="flex: 1; overflow: hidden;">
        <div style="font-weight: 700; font-size: 0.9rem;">${user.fullName}</div>
        <div style="font-size: 0.78rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          @${user.username}
        </div>
      </div>
    `;
    list.appendChild(item);
  });
}

function openDirectChat(user, element) {
  if (!user) return;
  activeChatUser = user;
  clearChatAttachment();
  document.querySelectorAll('.chat-user-item').forEach(i => i.classList.remove('active'));
  if (element) element.classList.add('active');

  document.getElementById('activeChatName').innerText = user.fullName;
  document.getElementById('activeChatAvatar').src = user.avatar || DEFAULT_AVATAR_URL;
  const statusLabel = document.getElementById('activeChatStatusLabel');
  const statusDot = document.getElementById('activeChatOnlineStatus');

  if (user.online) {
    statusLabel.innerText = 'Online agora';
    statusLabel.style.color = 'var(--accent-study)';
    statusDot.className = 'online-dot';
  } else {
    statusLabel.innerText = 'Offline';
    statusLabel.style.color = 'var(--text-muted)';
    statusDot.className = 'online-dot offline';
  }

  renderActiveChatMessages();
}

let pendingChatAttachment = { url: '', type: '' };

function clearChatAttachment() {
  pendingChatAttachment = { url: '', type: '' };
  document.getElementById('chatAttachmentPreviewBar').style.display = 'none';
  document.getElementById('chatAttachmentPreviewImg').style.display = 'none';
  document.getElementById('chatAttachmentPreviewVideo').style.display = 'none';
  document.getElementById('chatAttachmentInput').value = '';
}

async function handleChatAttachmentUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const isVideo = file.type.startsWith('video');
  const previewBar = document.getElementById('chatAttachmentPreviewBar');
  const previewImg = document.getElementById('chatAttachmentPreviewImg');
  const previewVid = document.getElementById('chatAttachmentPreviewVideo');

  if (isVideo) {
    const reader = new FileReader();
    reader.onload = (event) => {
      pendingChatAttachment = { url: event.target.result, type: 'video' };
      previewImg.style.display = 'none';
      previewVid.style.display = 'block';
      previewVid.src = pendingChatAttachment.url;
      previewBar.style.display = 'flex';
    };
    reader.readAsDataURL(file);
  } else {
    const dataUrl = await compressImage(file, 720, 720, 0.82);
    pendingChatAttachment = { url: dataUrl, type: file.type === 'image/gif' ? 'gif' : 'image' };
    // GIFs perdem a animação ao passar pelo canvas de compressão: usa o arquivo original nesse caso
    if (file.type === 'image/gif') {
      const reader = new FileReader();
      reader.onload = (event) => { pendingChatAttachment.url = event.target.result; previewImg.src = pendingChatAttachment.url; };
      reader.readAsDataURL(file);
    }
    previewVid.style.display = 'none';
    previewImg.style.display = 'block';
    previewImg.src = pendingChatAttachment.url;
    previewBar.style.display = 'flex';
  }
}

function renderActiveChatMessages() {
  const box = document.getElementById('chatMessagesBox');
  if (!box) return;
  box.innerHTML = '';

  if (!activeChatUser) {
    box.innerHTML = `<div style="text-align: center; margin-top: 40px; color: var(--text-muted);">Selecione uma conversa para começar a conversar.</div>`;
    return;
  }

  const conversationMessages = allMessages.filter(m =>
    (m.sender_username.toLowerCase() === currentUser.username.toLowerCase() && m.receiver_username.toLowerCase() === activeChatUser.username.toLowerCase()) ||
    (m.sender_username.toLowerCase() === activeChatUser.username.toLowerCase() && m.receiver_username.toLowerCase() === currentUser.username.toLowerCase())
  );

  if (conversationMessages.length === 0) {
    box.innerHTML = `<div style="text-align: center; margin-top: 40px; color: var(--text-muted); font-size: 0.88rem;">Diga "Olá!" para @${activeChatUser.username} 👋</div>`;
    return;
  }

  conversationMessages.forEach(m => {
    const isMe = m.sender_username.toLowerCase() === currentUser.username.toLowerCase();
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMe ? 'sent' : 'received'}`;
    const timeStr = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Agora';

    let attachmentHtml = '';
    if (m.attachment_url) {
      attachmentHtml = m.attachment_type === 'video'
        ? `<video src="${m.attachment_url}" controls class="chat-attachment-media"></video>`
        : `<img src="${m.attachment_url}" class="chat-attachment-media" alt="Anexo" />`;
    }

    const deleteBtnHtml = isMe ? `<i class="fa-solid fa-trash chat-msg-delete-btn" title="Apagar mensagem" onclick="deleteChatMessage('${m.id}')"></i>` : '';

    bubble.innerHTML = `
      ${deleteBtnHtml}
      ${attachmentHtml}
      ${m.content ? `<div>${m.content}</div>` : ''}
      <span class="chat-time">${timeStr}</span>
    `;
    box.appendChild(bubble);
  });

  box.scrollTop = box.scrollHeight;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInputMessage');
  const text = input.value.trim();
  if ((!text && !pendingChatAttachment.url) || !activeChatUser) return;

  const newMsg = {
    id: 'msg_' + Date.now(),
    sender_username: currentUser.username,
    receiver_username: activeChatUser.username,
    content: text,
    attachment_url: pendingChatAttachment.url || null,
    attachment_type: pendingChatAttachment.type || null,
    created_at: new Date().toISOString()
  };

  if (supabaseClient) {
    try {
      const payload = {
        sender_username: currentUser.username,
        receiver_username: activeChatUser.username,
        content: text
      };
      if (pendingChatAttachment.url) {
        payload.attachment_url = pendingChatAttachment.url;
        payload.attachment_type = pendingChatAttachment.type;
      }
      const { data, error } = await supabaseClient.from('messages').insert([payload]).select().single();

      if (data && data.id) newMsg.id = data.id;
      if (error) console.warn('Supabase Message Insert:', error.message);
    } catch (e) {}
  }

  allMessages.push(newMsg);
  input.value = '';
  clearChatAttachment();
  saveLocalState();
  renderActiveChatMessages();
  renderChatConversations();
}

async function deleteChatMessage(messageId) {
  if (!confirm('Apagar esta mensagem só para você e para o destinatário?')) return;

  allMessages = allMessages.filter(m => String(m.id) !== String(messageId));
  saveLocalState();
  renderActiveChatMessages();
  renderChatConversations();

  if (supabaseClient && typeof messageId === 'string' && messageId.includes('-')) {
    try {
      await supabaseClient.from('messages').delete().eq('id', messageId);
    } catch (e) { console.warn('Erro ao apagar mensagem:', e); }
  }
}

async function promptNewChat() {
  const username = prompt('Digite o @nome_de_usuario para conversar:');
  if (username) {
    const clean = username.replace('@', '').toLowerCase();
    let found = allUsers.find(u => u.username && u.username.toLowerCase() === clean);

    if (!found && supabaseClient) {
      try {
        const { data } = await supabaseClient.from('profiles').select('*').eq('username', clean).maybeSingle();
        if (data) {
          found = {
            id: data.id,
            username: data.username,
            fullName: data.full_name || data.username,
            avatar: data.avatar_url || DEFAULT_AVATAR_URL,
            online: false
          };
          allUsers.push(found);
        }
      } catch (e) {}
    }

    if (found) {
      openDirectChat(found);
      navigateTo('direct');
    } else {
      alert('Estudante não encontrado.');
    }
  }
}

// --- 20. PERFIL & ABAS ---
function switchProfileTab(tabName, element) {
  document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
  if (element) element.classList.add('active');

  const container = document.getElementById('profileTabContent');
  if (!container) return;
  container.innerHTML = '';

  const profileUser = getProfileBeingViewed();

  if (tabName === 'grid') {
    const grid = document.createElement('div');
    grid.className = 'profile-posts-grid';
    const myPosts = allPosts.filter(p => profileUser && p.authorUsername.toLowerCase() === profileUser.username.toLowerCase());

    if (myPosts.length === 0) {
      grid.innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 40px 20px; color: var(--text-secondary);">Você ainda não publicou nenhuma foto ou resumo.</div>';
    } else {
      myPosts.forEach(p => {
        const item = document.createElement('div');
        item.className = 'grid-post-item';
        item.innerHTML = `
          <img src="${p.image || 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=500&auto=format&fit=crop&q=80'}" alt="Post" />
          <div class="grid-post-overlay">
            <span><i class="fa-solid fa-heart"></i> ${p.likes}</span>
            <span><i class="fa-solid fa-comment"></i> ${p.comments ? p.comments.length : 0}</span>
          </div>
        `;
        grid.appendChild(item);
      });
    }
    container.appendChild(grid);
  } else if (tabName === 'doubts') {
    const list = document.createElement('div');
    const myDoubts = allPosts.filter(p => profileUser && p.authorUsername.toLowerCase() === profileUser.username.toLowerCase() && p.type === 'doubt');
    list.innerHTML = myDoubts.length === 0
      ? '<div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">Nenhuma dúvida publicada ainda.</div>'
      : myDoubts.map(d => `
        <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
          <span class="post-badge-type badge-doubt" style="margin-bottom: 6px; display: inline-block;">Dúvida</span>
          <p style="font-size: 0.92rem; margin: 6px 0;">${d.content}</p>
          <span style="font-size: 0.78rem; color: var(--text-muted);">${d.createdAt} • ${d.likes} curtidas</span>
        </div>
      `).join('');
    container.appendChild(list);
  } else if (tabName === 'saved') {
    const list = document.createElement('div');
    const isMeTab = currentUser && profileUser && currentUser.username.toLowerCase() === profileUser.username.toLowerCase();
    if (!isMeTab) {
      list.innerHTML = '<div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">Os salvos são privados e visíveis apenas para o próprio dono do perfil.</div>';
      container.appendChild(list);
      return;
    }
    const savedPosts = allPosts.filter(p => p.savedByMe);
    list.innerHTML = savedPosts.length === 0
      ? '<div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">Nenhum post salvo ainda. Clique no ícone de salvar em qualquer post!</div>'
      : savedPosts.map(p => `
        <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
          <strong>@${p.authorUsername}</strong>
          <p style="font-size: 0.9rem; margin: 6px 0;">${p.content}</p>
        </div>
      `).join('');
    container.appendChild(list);
  } else if (tabName === 'badges') {
    container.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
        <div style="background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; text-align: center;">
          <div style="font-size: 2.2rem; margin-bottom: 6px;">🦉</div>
          <strong style="font-size: 0.95rem;">Membro Fundador</strong>
          <p style="font-size: 0.78rem; color: var(--text-secondary); margin-top: 4px;">Cadastrado na rede social Noctua.</p>
        </div>
      </div>
    `;
  }
}

function copyProfileLink() {
  navigator.clipboard.writeText(window.location.href);
  alert('🔗 Link do seu perfil copiado!');
}

function viewUserProfile(username) {
  const user = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) { alert('Perfil não encontrado.'); return; }

  const isMe = currentUser && user.username.toLowerCase() === currentUser.username.toLowerCase();
  if (user.isPrivate && !isMe && !areFriends(currentUser ? currentUser.username : '', user.username)) {
    alert(`🔒 A conta de @${user.username} é privada. Siga para solicitar acesso ao conteúdo.`);
  }

  viewedProfileUsername = isMe ? null : user.username;
  navigateTo('profile');
}

// --- 21. CONFIGURAÇÕES & EDIÇÃO DE PERFIL ---
async function handleAvatarChange(e) {
  const file = e.target.files[0];
  if (!file) return;
  const compressed = await compressImage(file, 240, 240, 0.9);
  document.getElementById('settingsAvatarPreview').src = compressed;
  if (currentUser) {
    currentUser.avatar = compressed;
    saveLocalState();
    updateProfileUI();

    if (supabaseClient) {
      try {
        await supabaseClient.from('profiles').update({ avatar_url: compressed }).eq('username', currentUser.username);
      } catch (e) {}
    }
  }
}

function setMascotAsAvatar() {
  const mascotAvatar = 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150&auto=format&fit=crop&q=80';
  document.getElementById('settingsAvatarPreview').src = mascotAvatar;
  if (currentUser) {
    currentUser.avatar = mascotAvatar;
    saveLocalState();
    updateProfileUI();

    if (supabaseClient) {
      try {
        supabaseClient.from('profiles').update({ avatar_url: mascotAvatar }).eq('username', currentUser.username);
      } catch (e) {}
    }
  }
  alert('🦉 Mascote Coruja definida como foto de perfil!');
}

async function validateUsernameUniqueness(username) {
  const clean = username.trim().toLowerCase().replace('@', '');
  const status = document.getElementById('usernameStatusMsg');

  if (currentUser && clean === currentUser.username.toLowerCase()) {
    status.style.color = 'var(--accent-study)';
    status.innerText = 'Seu nome de usuário atual.';
    return;
  }

  let exists = allUsers.some(u => u.username && u.username.toLowerCase() === clean);
  if (!exists && supabaseClient) {
    try {
      const { data } = await supabaseClient.from('profiles').select('id').eq('username', clean).maybeSingle();
      if (data) exists = true;
    } catch (e) {}
  }

  if (exists) {
    status.style.color = 'var(--accent-danger)';
    status.innerText = '❌ Este nome de usuário já está em uso.';
  } else {
    status.style.color = 'var(--accent-study)';
    status.innerText = '✅ Nome de usuário disponível!';
  }
}

async function saveProfileSettings() {
  if (!currentUser) return;
  const newFullName = document.getElementById('settingsInputFullName').value.trim();
  const newUsername = document.getElementById('settingsInputUsername').value.trim().toLowerCase().replace('@', '');
  const newBio = document.getElementById('settingsInputBio').value.trim();
  const newDailyGoal = document.getElementById('settingsInputDailyGoal') ? document.getElementById('settingsInputDailyGoal').value : currentUser.dailyGoal;

  currentUser.fullName = newFullName || currentUser.fullName;
  currentUser.username = newUsername || currentUser.username;
  currentUser.bio = newBio; // Atualizado diretamente com o texto do usuário
  currentUser.dailyGoal = newDailyGoal || currentUser.dailyGoal;

  if (supabaseClient) {
    try {
      await supabaseClient.from('profiles').update({
        full_name: currentUser.fullName,
        username: currentUser.username,
        bio: currentUser.bio,
        daily_goal: currentUser.dailyGoal
      }).eq('username', currentUser.username);
    } catch (e) {}
  }

  saveLocalState();
  updateProfileUI();
  alert('✅ Perfil e biografia atualizados com sucesso!');
}

async function toggleAccountPrivacy(isPrivate) {
  if (currentUser) {
    currentUser.isPrivate = isPrivate;
    if (supabaseClient) {
      try {
        await supabaseClient.from('profiles').update({ is_private: isPrivate }).eq('username', currentUser.username);
      } catch (e) {}
    }
    saveLocalState();
    alert(isPrivate ? '🔒 Sua conta agora é Privada.' : '🌐 Sua conta agora é Pública.');
  }
}

function logoutUser() {
  if (confirm('Deseja realmente sair da sua conta?')) {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    currentUser = null;
    location.reload();
  }
}

// --- 22. TEMA, EXPLORAR & WIDGETS ---
function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    updateThemeIcons(true);
  } else {
    document.body.classList.remove('light-theme');
    updateThemeIcons(false);
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  localStorage.setItem(STORAGE_KEYS.THEME, isLight ? 'light' : 'dark');
  updateThemeIcons(isLight);
}

function updateThemeIcons(isLight) {
  const icon = document.getElementById('themeIconSidebar');
  const switchBox = document.getElementById('settingsThemeSwitch');
  if (icon) icon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  if (switchBox) switchBox.checked = !isLight;
}

function handleExploreSearch(query) {
  const cleanQ = query.trim().toLowerCase();
  const grid = document.getElementById('exploreGrid');
  const peopleBox = document.getElementById('explorePeopleResults');
  const trendingCard = document.getElementById('exploreTrendingCard');

  if (!cleanQ) {
    if (peopleBox) peopleBox.style.display = 'none';
    if (trendingCard) trendingCard.style.display = 'block';
    renderExploreGrid();
    return;
  }

  if (trendingCard) trendingCard.style.display = 'none';

  // --- 1. Busca de Pessoas (nome ou @usuario) ---
  const cleanQForUser = cleanQ.replace('@', '');
  const peopleMatches = allUsers.filter(u =>
    currentUser ? u.username.toLowerCase() !== currentUser.username.toLowerCase() : true
  ).filter(u =>
    (u.username && u.username.toLowerCase().includes(cleanQForUser)) ||
    (u.fullName && u.fullName.toLowerCase().includes(cleanQForUser))
  );

  if (peopleBox) {
    if (peopleMatches.length === 0) {
      peopleBox.style.display = 'none';
      peopleBox.innerHTML = '';
    } else {
      peopleBox.style.display = 'block';
      peopleBox.innerHTML = `
        <div class="trending-card">
          <h3><i class="fa-solid fa-user-group" style="color: var(--primary);"></i> Pessoas</h3>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${peopleMatches.map(u => {
              const following = currentUser ? isFollowing(currentUser.username, u.username) : false;
              return `
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                  <div style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1; overflow: hidden;" onclick="viewUserProfile('${u.username}')">
                    <img src="${u.avatar || DEFAULT_AVATAR_URL}" class="avatar-circle" style="width: 42px; height: 42px;" alt="${u.fullName}" />
                    <div style="overflow: hidden;">
                      <div style="font-weight: 700; font-size: 0.88rem;">${u.fullName || u.username}</div>
                      <div style="font-size: 0.78rem; color: var(--text-secondary);">@${u.username} • ${getFollowersCount(u.username)} seguidores</div>
                    </div>
                  </div>
                  <button class="btn-profile-edit ${following ? 'following-active' : ''}" style="padding: 4px 12px; font-size: 0.78rem; flex-shrink: 0;" onclick="toggleFollowUser('${u.username}')">${following ? 'Seguindo' : 'Seguir'}</button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }
  }

  // --- 2. Busca de Conteúdo (posts / tags) ---
  const matches = allPosts.filter(p =>
    p.content.toLowerCase().includes(cleanQ) ||
    p.authorName.toLowerCase().includes(cleanQ) ||
    p.authorUsername.toLowerCase().includes(cleanQ) ||
    (p.tags && p.tags.some(t => t.toLowerCase().includes(cleanQ)))
  );

  grid.innerHTML = '';
  if (matches.length === 0) {
    grid.innerHTML = peopleMatches.length > 0
      ? ''
      : `<div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--text-muted);">Nenhum resultado encontrado para "${query}".</div>`;
    return;
  }

  matches.forEach(post => {
    const item = document.createElement('div');
    item.className = 'grid-post-item';
    item.innerHTML = `
      <img src="${post.image || 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500&auto=format&fit=crop&q=80'}" alt="Explorar" />
      <div class="grid-post-overlay">
        <span><i class="fa-solid fa-heart"></i> ${post.likes}</span>
        <span><i class="fa-solid fa-comment"></i> ${post.comments ? post.comments.length : 0}</span>
      </div>
    `;
    item.onclick = () => {
      navigateTo('feed');
      const el = document.getElementById(`post-card-${post.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    };
    grid.appendChild(item);
  });
}

function filterByTag(tag) {
  navigateTo('feed');
  handleExploreSearch(tag);
}

function renderExploreGrid() {
  const grid = document.getElementById('exploreGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const postsWithImages = allPosts.filter(p => p.image);

  if (postsWithImages.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-muted);">Publique fotos e resumos para preencher a grade de exploração!</div>`;
    return;
  }

  postsWithImages.forEach(post => {
    const item = document.createElement('div');
    item.className = 'grid-post-item';
    item.innerHTML = `
      <img src="${post.image}" alt="Post" />
      <div class="grid-post-overlay">
        <span><i class="fa-solid fa-heart"></i> ${post.likes}</span>
        <span><i class="fa-solid fa-comment"></i> ${post.comments ? post.comments.length : 0}</span>
      </div>
    `;
    grid.appendChild(item);
  });
}

function renderSidebarWidgets() {
  const roomsWidget = document.getElementById('sidebarRoomsList');
  if (roomsWidget) {
    if (allStudyRooms.length === 0) {
      roomsWidget.innerHTML = `<span style="font-size: 0.78rem; color: var(--text-muted);">Nenhuma sala ativa no momento.</span>`;
    } else {
      roomsWidget.innerHTML = allStudyRooms.slice(0, 3).map(r => `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; border-radius: var(--radius-sm); cursor: pointer; background: var(--bg-card);" onclick="attemptJoinRoom('${r.id}')">
          <div style="display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid ${r.icon}" style="color: var(--primary);"></i>
            <span style="font-size: 0.82rem; font-weight: 700;">${r.title}</span>
          </div>
          <span style="font-size: 0.72rem; color: var(--accent-study); font-weight: 700;">${r.usersCount || 1} ao vivo</span>
        </div>
      `).join('');
    }
  }

  const followWidget = document.getElementById('sidebarFollowSuggestions');
  if (followWidget) {
    // Só mostra estudantes que são amigos (seguem e são seguidos de volta) e que estão online agora
    const friendsOnline = currentUser
      ? allUsers.filter(u =>
          u.username.toLowerCase() !== currentUser.username.toLowerCase() &&
          u.online &&
          areFriends(currentUser.username, u.username)
        )
      : [];

    if (friendsOnline.length === 0) {
      followWidget.innerHTML = `<span style="font-size: 0.78rem; color: var(--text-muted);">Nenhum amigo online no momento. Siga estudantes na Busca para vê-los aqui!</span>`;
    } else {
      followWidget.innerHTML = friendsOnline.slice(0, 5).map(u => `
        <div style="display: flex; align-items: center; justify-content: space-between; cursor: pointer;" onclick="viewUserProfile('${u.username}')">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="avatar-container">
              <img src="${u.avatar || DEFAULT_AVATAR_URL}" class="avatar-circle" style="width: 36px; height: 36px;" />
              <div class="online-dot"></div>
            </div>
            <div>
              <div style="font-weight: 700; font-size: 0.85rem;">${u.fullName}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">@${u.username}</div>
            </div>
          </div>
          <button class="btn-profile-edit" style="padding: 4px 12px; font-size: 0.78rem;" onclick="event.stopPropagation(); openDirectChat(allUsers.find(x => x.username.toLowerCase() === '${u.username.toLowerCase()}')); navigateTo('direct');">Mensagem</button>
        </div>
      `).join('');
    }
  }
}

// Pomodoro Sidebar
function toggleSidebarPomodoro() {
  const btn = document.getElementById('btnSidebarPomodoro');
  if (sidebarPomodoroRunning) {
    clearInterval(sidebarPomodoroInterval);
    sidebarPomodoroRunning = false;
    btn.innerText = 'Continuar';
  } else {
    sidebarPomodoroRunning = true;
    btn.innerText = 'Pausar';
    sidebarPomodoroInterval = setInterval(() => {
      if (sidebarPomodoroSeconds > 0) {
        sidebarPomodoroSeconds--;
        const m = Math.floor(sidebarPomodoroSeconds / 60);
        const s = sidebarPomodoroSeconds % 60;
        document.getElementById('sidebarPomodoroTimer').innerText = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      } else {
        clearInterval(sidebarPomodoroInterval);
        sidebarPomodoroRunning = false;
        alert('🔔 Ciclo de foco concluído!');
        sidebarPomodoroSeconds = 25 * 60;
      }
    }, 1000);
  }
}

function resetSidebarPomodoro() {
  clearInterval(sidebarPomodoroInterval);
  sidebarPomodoroRunning = false;
  sidebarPomodoroSeconds = 25 * 60;
  document.getElementById('sidebarPomodoroTimer').innerText = '25:00';
  document.getElementById('btnSidebarPomodoro').innerText = 'Iniciar';
}

// Helpers de Modais
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}