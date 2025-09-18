/* Case Counter Pro v2.0 — popup.js REFACTORIZADO - PARTE 1/2 - LEVEL UP MODIFICADOR */

// ========================================
// CONFIGURACIÓN Y CONSTANTES
// ========================================

const CONFIG = {
  STORAGE_KEY: "ccp_state_v2",
  USERS_CACHE_KEY: "ccp_users_cache_v1", 
  USERS_CACHE_TTL_MS: 24 * 60 * 60 * 1000,
  SCRIPT_URL: "https://script.google.com/a/macros/mercadolibre.com.co/s/AKfycbx919aqsYcXctJ_65XR6r60dz83_f4BDv63Sq6EqRdJzrKOT5i4OWgsc7KzFZRBmiyAlw/exec",
  
  SHIFT_HOURS: 8,
  RANKING_POLL_MS: 5000,
  LEADER_POLL_MS: 10000,
  ENABLE_FLOAT_CHIPS: false,
  
  ANIMS: {
    ambitious: { start: "🚀", goal: "🛸" },
    productivity: { start: "☕", goal: "💼" },
    magic: { start: "✨", goal: "🌟" },
    classic: { start: "📈", goal: "✅" }
  },
  
  THEME_COLORS: {
    mint: "#1DBA8E", purple: "#8A2BE2", sunset: "#FF7A18", 
    ocean: "#1E88E5", pink: "#EC4899"
  },
  
  THEME_ANIM: {
    mint: { start: "🍃", goal: "🌿" }, 
    purple: { start: "🌌", goal: "✨" }, 
    sunset: { start: "🌇", goal: "🌞" }, 
    ocean: { start: "🌊", goal: "🐬" }, 
    pink: { start: "🌸", goal: "🌟" }
  }
};

// ========================================
// STORE CENTRALIZADO - GESTIÓN DE ESTADO
// ========================================

class AppStore {
  constructor() {
    this.state = this.getDefaultState();
    this.usersCache = { fetchedAt: 0, byUser: {} };
    this.subscribers = new Set();
  }
  
  getDefaultState() {
    return {
      // Usuario y sesión
      user: null,
      lastView: "main",
      
      // Datos diarios
      todayKey: this.dateKey(new Date()),
      counts: { on: 0, off: 0, level: 0, total: 0 },
      history: [],
      dailyGoal: 50,
      
      // NUEVO: Level Up como modificador
      levelUpMode: false,
      
      // Temas y personalización
      theme: "mint",
      themeCustom: null,
      animation: "ambitious",
      progressMode: "theme",
      themePair: CONFIG.THEME_ANIM.mint,
      
      // Estado de gamificación
      celebrated: false,
      lastCaseId: null,
      
      // CORREGIDO: Datos de gamificación v2.0
      streaks: {
        current: 0,
        best: 0,
        lastMetDate: null
      },
      
      achievements: {
        unlocked: [],
        progress: {},
        newlyUnlocked: []
      },
      
      weeklyData: Array(7).fill(0),
      
      // CORREGIDO: Métricas de última hora (no 30 min)
      hourlyMetrics: {
        currentHour: null,
        currentHourCases: [],
        teamTotalToday: 0,
        myParticipation: 0
      },
      
      // Datos del backend
      rankingFromScript: null,
      leaderData: null,
      
      // UI y filtros
      ui: { bestRate: 0, bestDailyTotal: 0 },
      historyFilters: { type: "", date: "" }
    };
  }
  
  // Utilidades de fecha
  dateKey(date) {
    return date.toISOString().slice(0, 10);
  }
  
  getCurrentHour() {
    const now = new Date();
    return now.getHours();
  }
  
  getCurrentHourRange() {
    const hour = this.getCurrentHour();
    const nextHour = (hour + 1) % 24;
    return `${hour.toString().padStart(2, '0')}:00-${nextHour.toString().padStart(2, '0')}:00`;
  }
  
  // Gestión de estado
  async loadState() {
    try {
      const result = await chrome.storage.local.get([CONFIG.STORAGE_KEY, CONFIG.USERS_CACHE_KEY]);
      
      if (result[CONFIG.STORAGE_KEY]) {
        this.state = { ...this.getDefaultState(), ...result[CONFIG.STORAGE_KEY] };
      }
      
      if (result[CONFIG.USERS_CACHE_KEY]) {
        this.usersCache = result[CONFIG.USERS_CACHE_KEY];
      }
      
      // Migrar a nuevo día si es necesario
      const todayKey = this.dateKey(new Date());
      if (this.state.todayKey !== todayKey) {
        await this.migrateToNewDay(todayKey);
      }
      
      // Migración de datos v1 -> v2
      this.migrateToV2();
      
      // Inicializar métricas de hora actual
      this.initializeHourlyMetrics();
      
      this.notifySubscribers('state-loaded');
    } catch (error) {
      console.error('[Store] Error cargando estado:', error);
    }
  }
  
  async migrateToNewDay(newTodayKey) {
    // Actualizar racha antes de resetear datos
    if (this.state.user) {
      this.updateStreakForNewDay();
    }
    
    // Resetear datos del día
    this.state.todayKey = newTodayKey;
    this.state.counts = { on: 0, off: 0, level: 0, total: 0 };
    this.state.history = [];
    this.state.celebrated = false;
    this.state.lastCaseId = null;
    this.state.levelUpMode = false;
    
    this.initializeHourlyMetrics();
    
    await this.saveState();
  }
  
  migrateToV2() {
    // Migrar datos que no existen en v1
    if (!this.state.streaks) {
      this.state.streaks = { current: 0, best: 0, lastMetDate: null };
    }
    
    if (!this.state.achievements) {
      this.state.achievements = { unlocked: [], progress: {}, newlyUnlocked: [] };
    }
    
    if (!this.state.weeklyData) {
      this.state.weeklyData = Array(7).fill(0);
    }
    
    if (!this.state.hourlyMetrics) {
      this.initializeHourlyMetrics();
    }
    
    if (this.state.levelUpMode === undefined) {
      this.state.levelUpMode = false;
    }
  }
  
  initializeHourlyMetrics() {
    this.state.hourlyMetrics = {
      currentHour: this.getCurrentHour(),
      currentHourCases: [],
      teamTotalToday: 0,
      myParticipation: 0
    };
  }
  
  async saveState() {
    try {
      await chrome.storage.local.set({ 
        [CONFIG.STORAGE_KEY]: this.state,
        [CONFIG.USERS_CACHE_KEY]: this.usersCache
      });
      
      // Actualizar badge
      apiClient.updateBadge(
        this.state.counts.total,
        this.state.counts.total >= this.state.dailyGoal,
        this.getThemePrimaryColor()
      );
      
    } catch (error) {
      console.error('[Store] Error guardando estado:', error);
    }
  }
  
  // Getters
  getState() {
    return this.state;
  }
  
  getThemePrimaryColor() {
    return this.state.themeCustom || CONFIG.THEME_COLORS[this.state.theme] || CONFIG.THEME_COLORS.mint;
  }
  
  // Suscriptores para reactividad
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  notifySubscribers(event, data = null) {
    this.subscribers.forEach(callback => {
      try {
        callback(event, data, this.state);
      } catch (error) {
        console.error('[Store] Error en suscriptor:', error);
      }
    });
  }
  
  // Acciones del estado
  setUser(user) {
    this.state.user = user;
    this.saveState();
    this.notifySubscribers('user-changed', user);
  }
  
  // NUEVO: Level Up Mode
  toggleLevelUpMode() {
    this.state.levelUpMode = !this.state.levelUpMode;
    this.saveState();
    this.notifySubscribers('levelup-mode-changed', this.state.levelUpMode);
    return this.state.levelUpMode;
  }
  
  deactivateLevelUpMode() {
    if (this.state.levelUpMode) {
      this.state.levelUpMode = false;
      this.saveState();
      this.notifySubscribers('levelup-mode-changed', false);
    }
  }
  
  // CORREGIDO: Update counts con Level Up como modificador
  updateCounts(type) {
    const isLevelUp = this.state.levelUpMode;
    
    if (type === "on") {
      this.state.counts.on++;
      if (isLevelUp) this.state.counts.level++;
    } else if (type === "off") {
      this.state.counts.off++;
      if (isLevelUp) this.state.counts.level++;
    }
    
    this.state.counts.total++;
    
    // Desactivar Level Up después de usar
    if (isLevelUp) {
      this.deactivateLevelUpMode();
    }
    
    // Actualizar métricas de hora actual
    this.updateHourlyMetrics();
    
    this.saveState();
    this.notifySubscribers('counts-updated', this.state.counts);
    
    // Verificar logros
    this.checkAchievements();
  }
  
  addToHistory(type, caseId) {
    const timestamp = Date.now();
    const isLevelUp = this.state.levelUpMode;
    
    // CORREGIDO: Registrar en historial con modificador Level Up
    this.state.history.push({
      type,
      id: caseId,
      ts: timestamp,
      levelUp: isLevelUp // Flag para indicar si fue Level Up
    });
    
    this.state.lastCaseId = caseId;
    
    // Actualizar casos de la hora actual
    this.state.hourlyMetrics.currentHourCases.push({
      timestamp,
      type,
      levelUp: isLevelUp
    });
    
    // Limpiar casos de horas anteriores
    const currentHour = this.getCurrentHour();
    if (this.state.hourlyMetrics.currentHour !== currentHour) {
      this.state.hourlyMetrics.currentHour = currentHour;
      this.state.hourlyMetrics.currentHourCases = this.state.hourlyMetrics.currentHourCases
        .filter(item => {
          const itemHour = new Date(item.timestamp).getHours();
          return itemHour === currentHour;
        });
    }
    
    this.saveState();
    this.notifySubscribers('history-updated');
  }
  
  updateHourlyMetrics() {
    const currentHour = this.getCurrentHour();
    
    // Filtrar casos de la hora actual
    this.state.hourlyMetrics.currentHourCases = this.state.hourlyMetrics.currentHourCases
      .filter(item => {
        const itemHour = new Date(item.timestamp).getHours();
        return itemHour === currentHour;
      });
    
    this.state.hourlyMetrics.currentHour = currentHour;
  }
  
  undoLastCase() {
    const lastCase = this.state.history.pop();
    if (!lastCase) return false;
    
    // Revertir conteos incluyendo Level Up
    if (lastCase.type === "on" && this.state.counts.on > 0) {
      this.state.counts.on--;
      if (lastCase.levelUp && this.state.counts.level > 0) {
        this.state.counts.level--;
      }
    } else if (lastCase.type === "off" && this.state.counts.off > 0) {
      this.state.counts.off--;
      if (lastCase.levelUp && this.state.counts.level > 0) {
        this.state.counts.level--;
      }
    }
    
    if (this.state.counts.total > 0) this.state.counts.total--;
    
    // Actualizar métricas
    this.updateHourlyMetrics();
    
    this.saveState();
    this.notifySubscribers('case-undone', lastCase);
    
    return true;
  }
  
  setDailyGoal(goal) {
    this.state.dailyGoal = Math.max(1, Math.floor(Number(goal) || this.state.dailyGoal));
    this.state.celebrated = this.state.counts.total >= this.state.dailyGoal;
    this.saveState();
    this.notifySubscribers('goal-updated', this.state.dailyGoal);
  }
  
  // Sistema de rachas
  updateStreakForNewDay() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = this.dateKey(yesterday);
    
    // Si cumplimos la meta ayer, continuamos la racha
    if (this.state.counts.total >= this.state.dailyGoal && 
        this.state.streaks.lastMetDate === yesterdayKey) {
      this.state.streaks.current++;
      this.state.streaks.best = Math.max(this.state.streaks.best, this.state.streaks.current);
    } else if (this.state.streaks.lastMetDate !== yesterdayKey) {
      // Rompemos la racha si no cumplimos ayer
      this.state.streaks.current = 0;
    }
  }
  
  checkGoalMet() {
    if (this.state.counts.total >= this.state.dailyGoal && !this.state.celebrated) {
      this.state.celebrated = true;
      this.state.streaks.lastMetDate = this.state.todayKey;
      
      // Actualizar racha actual
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = this.dateKey(yesterday);
      
      if (this.state.streaks.lastMetDate === yesterdayKey || this.state.streaks.current === 0) {
        this.state.streaks.current++;
        this.state.streaks.best = Math.max(this.state.streaks.best, this.state.streaks.current);
      }
      
      this.saveState();
      this.notifySubscribers('goal-met');
      return true;
    }
    return false;
  }
  
  // CORREGIDO: Sistema de logros con rangos 50-250
  checkAchievements() {
    const newAchievements = [];
    
    // CORREGIDO: Definir logros con nuevos rangos
    const achievementDefinitions = [
      // Casos ON - Rangos: 50, 100, 200, 250
      { id: 'on_50', category: 'on', name: 'Comunicador', desc: '50 casos ON', icon: '📞', target: 50, current: this.state.counts.on },
      { id: 'on_100', category: 'on', name: 'Conversador', desc: '100 casos ON', icon: '💬', target: 100, current: this.state.counts.on },
      { id: 'on_200', category: 'on', name: 'Maestro ON', desc: '200 casos ON', icon: '📻', target: 200, current: this.state.counts.on },
      { id: 'on_250', category: 'on', name: 'Leyenda ON', desc: '250 casos ON', icon: '🎯', target: 250, current: this.state.counts.on, legendary: true },
      
      // Casos OFF - Rangos: 50, 100, 200, 250  
      { id: 'off_50', category: 'off', name: 'Investigador', desc: '50 casos OFF', icon: '📧', target: 50, current: this.state.counts.off },
      { id: 'off_100', category: 'off', name: 'Analista', desc: '100 casos OFF', icon: '🔍', target: 100, current: this.state.counts.off },
      { id: 'off_200', category: 'off', name: 'Detective', desc: '200 casos OFF', icon: '🕵️', target: 200, current: this.state.counts.off },
      { id: 'off_250', category: 'off', name: 'Leyenda OFF', desc: '250 casos OFF', icon: '🎖️', target: 250, current: this.state.counts.off, legendary: true },
      
      // Level Up
      { id: 'level_10', category: 'level', name: 'Escalador', desc: '10 Level Up', icon: '✨', target: 10, current: this.state.counts.level },
      { id: 'level_25', category: 'level', name: 'Especialista', desc: '25 Level Up', icon: '⭐', target: 25, current: this.state.counts.level },
      
      // Consistencia/Rachas
      { id: 'streak_3', category: 'streak', name: 'Constante', desc: '3 días seguidos', icon: '🔥', target: 3, current: this.state.streaks.current },
      { id: 'streak_7', category: 'streak', name: 'Disciplinado', desc: '7 días seguidos', icon: '💪', target: 7, current: this.state.streaks.current }
    ];
    
    // Verificar cada logro
    achievementDefinitions.forEach(achievement => {
      const isUnlocked = this.state.achievements.unlocked.includes(achievement.id);
      
      if (!isUnlocked && achievement.current >= achievement.target) {
        // Desbloquear logro
        this.state.achievements.unlocked.push(achievement.id);
        this.state.achievements.newlyUnlocked.push(achievement.id);
        newAchievements.push(achievement);
      } else if (!isUnlocked) {
        // Actualizar progreso
        this.state.achievements.progress[achievement.id] = {
          current: achievement.current,
          target: achievement.target,
          percentage: Math.round((achievement.current / achievement.target) * 100)
        };
      }
    });
    
    if (newAchievements.length > 0) {
      this.saveState();
      this.notifySubscribers('achievements-unlocked', newAchievements);
    }
    
    return newAchievements;
  }
  
  clearNewlyUnlockedAchievements() {
    this.state.achievements.newlyUnlocked = [];
    this.saveState();
  }
  
  // NUEVO: Actualizar datos del equipo
  updateTeamData(teamTotal) {
    this.state.hourlyMetrics.teamTotalToday = teamTotal;
    
    if (teamTotal > 0) {
      this.state.hourlyMetrics.myParticipation = 
        Math.round((this.state.counts.total / teamTotal) * 100);
    } else {
      this.state.hourlyMetrics.myParticipation = 0;
    }
    
    this.saveState();
    this.notifySubscribers('team-data-updated');
  }
}

// ========================================
// API CLIENT - COMUNICACIÓN CON BACKEND
// ========================================

class ApiClient {
  constructor() {
    this.baseUrl = CONFIG.SCRIPT_URL;
  }
  
  // Comunicación con background script
  async sendMessage(type, payload = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        resolve(response || { ok: false, error: 'No response' });
      });
    });
  }
  
  // CORREGIDO: Registro de casos con Level Up como modificador
  async registerCase(usuario, lider, tipo, caseId, isLevelUp = false) {
    const payload = {
      action: "register_case",
      usuario: usuario.toLowerCase(),
      lider: lider.toLowerCase(), 
      tipo: tipo.toUpperCase(),
      caseId: String(caseId).trim(),
      levelUp: isLevelUp // NUEVO: Flag Level Up
    };
    
    console.log('[API] Registrando caso:', payload);
    
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      return { ok: data.ok, data };
    } catch (error) {
      console.error('[API] Error registrando caso:', error);
      return { ok: false, error: error.message };
    }
  }
  
  // Obtener datos del equipo
  async fetchTeamData(leaderLdap, fecha) {
    try {
      const url = `${this.baseUrl}?equipo=${encodeURIComponent(leaderLdap)}&fecha=${encodeURIComponent(fecha)}`;
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('[API] Datos del equipo recibidos:', data.ok);
      return data;
    } catch (error) {
      console.error('[API] Error obteniendo datos del equipo:', error);
      return { ok: false, error: error.message };
    }
  }
  
  // Obtener usuarios
  async fetchUsers() {
    try {
      const response = await fetch(`${this.baseUrl}?usuarios=1`);
      const data = await response.json();
      
      if (data.ok && Array.isArray(data.usuarios)) {
        return { ok: true, usuarios: data.usuarios };
      }
      
      return { ok: false, error: 'Invalid users data' };
    } catch (error) {
      console.error('[API] Error obteniendo usuarios:', error);
      return { ok: false, error: error.message };
    }
  }
  
  // Lookup de usuario específico
  async lookupUser(ldap) {
    try {
      const response = await fetch(`${this.baseUrl}?lookupUsuario=${encodeURIComponent(ldap)}`);
      const data = await response.json();
      
      if (data.ok && data.usuario) {
        return { 
          ok: true, 
          user: {
            ldap: data.usuario.toLowerCase(),
            name: data.nombre || '',
            leader: (data.lider || '').toLowerCase()
          }
        };
      }
      
      return { ok: false, error: 'Usuario no encontrado' };
    } catch (error) {
      console.error('[API] Error en lookup de usuario:', error);
      return { ok: false, error: error.message };
    }
  }
  
  // Actualizar badge
  updateBadge(total, goalReached, color) {
    this.sendMessage('UPDATE_BADGE', { 
      total, 
      goalReached, 
      color 
    });
  }
}

// ========================================
// GESTIÓN DE USUARIOS Y CACHE
// ========================================

class UserManager {
  constructor(store, apiClient) {
    this.store = store;
    this.api = apiClient;
  }
  
  isCacheExpired() {
    const { fetchedAt } = this.store.usersCache;
    return (Date.now() - fetchedAt) > CONFIG.USERS_CACHE_TTL_MS;
  }
  
  async refreshUsersCache() {
    const result = await this.api.fetchUsers();
    
    if (result.ok) {
      const userMap = {};
      
      result.usuarios.forEach(user => {
        const ldap = String(user.usuario || '').trim().toLowerCase();
        const leader = String(user.lider || '').trim().toLowerCase();
        const name = String(user.nombre || '').trim();
        
        if (ldap) {
          userMap[ldap] = { leader, name };
        }
      });
      
      this.store.usersCache = {
        fetchedAt: Date.now(),
        byUser: userMap
      };
      
      await this.store.saveState();
      return true;
    }
    
    return false;
  }
  
  async lookupUser(ldap) {
    const normalizedLdap = String(ldap || '').trim().toLowerCase();
    if (!normalizedLdap) return null;
    
    // Verificar cache primero
    if (!this.isCacheExpired() && this.store.usersCache.byUser[normalizedLdap]) {
      return {
        ldap: normalizedLdap,
        ...this.store.usersCache.byUser[normalizedLdap]
      };
    }
    
    // Refrescar cache si es necesario
    if (this.isCacheExpired()) {
      await this.refreshUsersCache();
      
      if (this.store.usersCache.byUser[normalizedLdap]) {
        return {
          ldap: normalizedLdap,
          ...this.store.usersCache.byUser[normalizedLdap]
        };
      }
    }
    
    // Lookup directo como fallback
    const result = await this.api.lookupUser(normalizedLdap);
    
    if (result.ok) {
      // Actualizar cache
      this.store.usersCache.byUser[normalizedLdap] = {
        leader: result.user.leader,
        name: result.user.name
      };
      
      this.store.usersCache.fetchedAt = Date.now();
      await this.store.saveState();
      
      return result.user;
    }
    
    return null;
  }
  
  async validateAgentLogin(agentLdap, leaderLdap) {
    const userInfo = await this.lookupUser(agentLdap);
    
    if (!userInfo) {
      return { ok: false, reason: "Usuario no encontrado en 'Usuarios'." };
    }
    
    const expectedLeader = String(leaderLdap || '').trim().toLowerCase();
    
    if (userInfo.leader !== expectedLeader) {
      return { ok: false, reason: "El líder no coincide con la hoja 'Usuarios'." };
    }
    
    return { 
      ok: true, 
      user: {
        role: 'agent',
        ldap: agentLdap.toLowerCase(),
        name: userInfo.name,
        leaderLdap: expectedLeader
      }
    };
  }
  
  async validateLeaderLogin(leaderLdap) {
    const normalizedLeader = String(leaderLdap || '').trim().toLowerCase();
    
    // Verificar si hay usuarios bajo este líder
    if (this.isCacheExpired()) {
      await this.refreshUsersCache();
    }
    
    const hasTeam = Object.values(this.store.usersCache.byUser || {})
      .some(user => user.leader === normalizedLeader);
    
    return {
      ok: true,
      user: {
        role: 'leader',
        ldap: normalizedLeader,
        leaderLdap: normalizedLeader
      },
      hasTeam
    };
  }
}

// ========================================
// INSTANCIAS GLOBALES
// ========================================

const store = new AppStore();
const apiClient = new ApiClient();
const userManager = new UserManager(store, apiClient);

// Utilidades globales
const qs = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* Case Counter Pro v2.0 — popup.js REFACTORIZADO - PARTE 2/2 - UI Y PANEL LÍDER */

// ========================================
// UI RENDERER - GESTIÓN DE INTERFAZ
// ========================================

class UIRenderer {
  constructor(store) {
    this.store = store;
    this.elements = this.initializeElements();
    this.pollTimer = null;
    this.leaderPollTimer = null;
  }
  
  initializeElements() {
    return {
      // Views
      views: {
        login: qs("#loginView"), main: qs("#mainView"), ranking: qs("#rankingView"),
        settings: qs("#settingsView"), focus: qs("#focusView"), leader: qs("#leaderView"),
        achievements: qs("#achievementsView"), history: qs("#historyView")
      },
      
      // Login
      roleRep: qs("#roleRep"), roleLeader: qs("#roleLeader"),
      leaderLdapInput: qs("#leaderLdapInput"), ldapInput: qs("#ldapInput"),
      loginBtn: qs("#loginBtn"), loginError: qs("#loginError"),
      repFieldWrap: qs("#repFieldWrap"),
      
      // Main view
      caseIdInput: qs("#caseIdInput"), btnOn: qs("#btnOn"), btnOff: qs("#btnOff"),
      levelUpModifier: qs("#levelUpModifier"), levelUpIndicator: qs("#levelUpIndicator"),
      caseInputContainer: qs("#caseInputContainer"),
      goalText: qs("#goalText"), progressBar: qs("#progressBar"), progressIcon: qs("#progressIcon"),
      
      // CORREGIDO: Elementos de rachas reubicadas
      streakDays: qs("#streakDays"), streakBest: qs("#streakBest"),
      
      // CORREGIDO: Elementos de métricas de última hora  
      currentHourRange: qs("#currentHourRange"),
      lastHourCases: qs("#lastHourCases"),
      teamTotal: qs("#teamTotal"),
      myParticipation: qs("#myParticipation"),
      
      // Stats
      statOn: qs("#statOn"), statOff: qs("#statOff"), 
      statLevel: qs("#statLevel"), statTotal: qs("#statTotal"),
      
      // Ranking
      miniRanking: qs("#miniRanking"), rankingList: qs("#rankingList"),
      motivationalMessage: qs("#motivationalMessage"),
      
      // Focus
      focusCaseId: qs("#focusCaseId"), focusOn: qs("#focusOn"), 
      focusOff: qs("#focusOff"), focusTotal: qs("#focusTotal"),
      focusProgress: qs("#focusProgress"), focusProgressIcon: qs("#focusProgressIcon"),
      focusLevelUpModifier: qs("#focusLevelUpModifier"),
      
      // Achievements
      achievementCount: qs("#achievementCount"),
      achievementsOn: qs("#achievementsOn"), achievementsOff: qs("#achievementsOff"),
      achievementsLevel: qs("#achievementsLevel"), achievementsStreak: qs("#achievementsStreak"),
      
      // NUEVO: Panel del Líder Híbrido
      leaderTotalCases: qs("#leaderTotalCases"),
      leaderGoalPercent: qs("#leaderGoalPercent"),
      leaderTopPerformer: qs("#leaderTopPerformer"),
      leaderTopCases: qs("#leaderTopCases"),
      leaderActiveCount: qs("#leaderActiveCount"),
      leaderInactiveCount: qs("#leaderInactiveCount"),
      leaderTrendDaily: qs("#leaderTrendDaily"),
      leaderTrendGoal: qs("#leaderTrendGoal"),
      leaderLiveRanking: qs("#leaderLiveRanking"),
      leaderInsights: qs("#leaderInsights"),
      
      // Weekly stats
      weeklyStatsBtn: qs("#weeklyStatsBtn"),
      weeklyStatsPanel: qs("#weeklyStatsPanel"),
      closeWeeklyStats: qs("#closeWeeklyStats"),
      weeklyChart: qs("#weeklyChart"),
      weeklyTotal: qs("#weeklyTotal"),
      
      // Otros
      liveClock: qs("#liveClock"), lastCaseId: qs("#lastCaseId"),
      lastCaseIdFocus: qs("#lastCaseIdFocus"), toastHost: qs("#toastHost"),
      helpModal: qs("#helpModal"), undoBtn: qs("#undoBtn"),
      
      // History
      historyList: qs("#historyList"), historyDate: qs("#historyDate"),
      historyType: qs("#historyType"), histStatsOn: qs("#histStatsOn"),
      histStatsOff: qs("#histStatsOff"), histStatsLevel: qs("#histStatsLevel"),
      histStatsTotal: qs("#histStatsTotal")
    };
  }
  
  // Navegación entre vistas
  setActiveView(viewName) {
    Object.values(this.elements.views).forEach(view => {
      if (view) view.classList.remove("active");
    });
    
    if (this.elements.views[viewName]) {
      this.elements.views[viewName].classList.add("active");
    }
    
    // Actualizar estado
    this.store.state.lastView = viewName;
    this.store.saveState();
    
    // Aplicar tema y clases de rol
    this.applyTheme();
    
    // Renderizar vista específica
    this.renderCurrentView(viewName);
    
    // Gestionar polling
    this.managePolling(viewName);
  }
  
  renderCurrentView(viewName) {
    switch(viewName) {
      case 'main':
      case 'focus':
        this.renderMainView();
        break;
      case 'ranking':
        this.renderRankingView();
        break;
      case 'achievements':
        this.renderAchievementsView();
        break;
      case 'history':
        this.renderHistoryView();
        break;
      case 'leader':
        this.renderLeaderView();
        break;
    }
  }
  
  managePolling(viewName) {
    // Limpiar timers existentes
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.leaderPollTimer) {
      clearInterval(this.leaderPollTimer);
      this.leaderPollTimer = null;
    }
    
    const user = this.store.state.user;
    if (!user) return;
    
    if (user.role === 'agent') {
      if (viewName === 'ranking') {
        this.startAgentRankingPolling();
      } else {
        this.startAgentMainPolling();
      }
    } else if (user.role === 'leader' && viewName === 'leader') {
      this.startLeaderPolling();
    }
  }
  
  startAgentMainPolling() {
    this.fetchTeamRanking();
    this.pollTimer = setInterval(() => {
      this.fetchTeamRanking();
    }, CONFIG.RANKING_POLL_MS);
  }
  
  startAgentRankingPolling() {
    this.fetchTeamRanking();
    this.pollTimer = setInterval(() => {
      this.fetchTeamRanking();
    }, CONFIG.RANKING_POLL_MS);
  }
  
  startLeaderPolling() {
    this.fetchLeaderData();
    this.leaderPollTimer = setInterval(() => {
      this.fetchLeaderData();
    }, CONFIG.LEADER_POLL_MS);
  }
  
  async fetchTeamRanking() {
    const user = this.store.state.user;
    if (!user || !user.leaderLdap) return;
    
    const fecha = this.store.dateKey(new Date());
    const data = await apiClient.fetchTeamData(user.leaderLdap, fecha);
    
    if (data.ok) {
      // Actualizar datos del equipo en el store
      this.store.state.rankingFromScript = data.ranking || [];
      
      // CORREGIDO: Actualizar datos semanales y del equipo
      if (data.kpis) {
        if (data.kpis.weeklyData) {
          this.store.state.weeklyData = data.kpis.weeklyData;
        }
        if (data.kpis.teamTotal) {
          this.store.updateTeamData(data.kpis.teamTotal);
        }
      }
      
      this.store.saveState();
      
      // Re-renderizar vistas relevantes
      if (this.store.state.lastView === 'main' || this.store.state.lastView === 'focus') {
        this.renderMainView();
      }
      if (this.store.state.lastView === 'ranking') {
        this.renderRankingView();
      }
    }
  }
  
  async fetchLeaderData() {
    const user = this.store.state.user;
    if (!user || user.role !== 'leader') return;
    
    const fecha = this.store.dateKey(new Date());
    const data = await apiClient.fetchTeamData(user.leaderLdap, fecha);
    
    if (data.ok) {
      this.store.state.leaderData = data;
      this.store.saveState();
    }
    
    this.renderLeaderHybridDashboard(data.ok ? data : { ranking: [], kpis: {} });
  }
  
  // CORREGIDO: Renderizado de vista principal
  renderMainView() {
    const state = this.store.state;
    
    // Stats básicas
    if (this.elements.statOn) this.elements.statOn.textContent = state.counts.on;
    if (this.elements.statOff) this.elements.statOff.textContent = state.counts.off;
    if (this.elements.statLevel) this.elements.statLevel.textContent = state.counts.level;
    if (this.elements.statTotal) this.elements.statTotal.textContent = state.counts.total;
    if (this.elements.focusTotal) this.elements.focusTotal.textContent = state.counts.total;
    
    // Meta y progreso
    if (this.elements.goalText) {
      this.elements.goalText.textContent = `${state.counts.total} / ${state.dailyGoal}`;
    }
    
    this.renderProgress();
    this.renderStreaks();
    this.renderHourlyMetrics();
    this.renderMiniRanking();
    this.updateLastCaseId();
    this.updateLevelUpMode();
  }
  
  renderProgress() {
    const state = this.store.state;
    const percentage = Math.max(0, Math.min(100, (state.counts.total / state.dailyGoal) * 100));
    
    // Obtener íconos según el modo
    const pair = (state.progressMode === "theme") ? 
      (state.themePair || CONFIG.THEME_ANIM.mint) : 
      (CONFIG.ANIMS[state.animation] || CONFIG.ANIMS.ambitious);
    
    // Actualizar barras de progreso
    [this.elements.progressBar, this.elements.focusProgress].forEach(el => {
      if (el) el.style.width = `${percentage}%`;
    });
    
    // Actualizar íconos
    [this.elements.progressIcon, this.elements.focusProgressIcon].forEach(el => {
      if (el) {
        el.textContent = percentage >= 100 ? pair.goal : pair.start;
        el.style.left = `calc(${percentage}% + 0px)`;
      }
    });
    
    // Verificar si se cumplió la meta
    if (this.store.checkGoalMet()) {
      this.celebrateGoal(pair.goal);
    }
  }
  
  // CORREGIDO: Renderizar rachas (ahora en nueva ubicación)
  renderStreaks() {
    const streaks = this.store.state.streaks;
    
    if (this.elements.streakDays) {
      this.elements.streakDays.textContent = streaks.current;
    }
    
    if (this.elements.streakBest) {
      this.elements.streakBest.textContent = streaks.best;
    }
  }
  
  // NUEVO: Renderizar métricas de última hora
  renderHourlyMetrics() {
    const metrics = this.store.state.hourlyMetrics;
    
    // Rango de hora actual
    if (this.elements.currentHourRange) {
      this.elements.currentHourRange.textContent = this.store.getCurrentHourRange();
    }
    
    // Casos de la última hora
    const lastHourCount = metrics.currentHourCases.length;
    if (this.elements.lastHourCases) {
      this.elements.lastHourCases.textContent = `${lastHourCount} casos`;
    }
    
    // Total del equipo y participación
    if (this.elements.teamTotal) {
      this.elements.teamTotal.textContent = metrics.teamTotalToday;
    }
    
    if (this.elements.myParticipation) {
      this.elements.myParticipation.textContent = `${metrics.myParticipation}%`;
    }
  }
  
  // NUEVO: Actualizar estado Level Up Mode
  updateLevelUpMode() {
    const isActive = this.store.state.levelUpMode;
    
    // Actualizar botón Level Up
    if (this.elements.levelUpModifier) {
      this.elements.levelUpModifier.classList.toggle('active', isActive);
    }
    
    if (this.elements.focusLevelUpModifier) {
      this.elements.focusLevelUpModifier.classList.toggle('active', isActive);
    }
    
    // Actualizar container del input
    if (this.elements.caseInputContainer) {
      this.elements.caseInputContainer.classList.toggle('level-up-mode', isActive);
    }
    
    // Mostrar/ocultar indicador
    if (this.elements.levelUpIndicator) {
      this.elements.levelUpIndicator.hidden = !isActive;
    }
    
    // Actualizar botones ON/OFF
    const levelIndicators = $$('.btn-level-indicator');
    levelIndicators.forEach(indicator => {
      indicator.hidden = !isActive;
    });
    
    // Agregar clases a botones cuando Level Up está activo
    if (this.elements.btnOn) {
      this.elements.btnOn.classList.toggle('level-up-active', isActive);
    }
    
    if (this.elements.btnOff) {
      this.elements.btnOff.classList.toggle('level-up-active', isActive);
    }
  }
  
  // Mini ranking mejorado
  renderMiniRanking() {
    if (!this.elements.miniRanking) return;
    
    const user = this.store.state.user;
    if (!user) return;
    
    this.elements.miniRanking.innerHTML = "";
    
    const ranking = this.computeRankingArray();
    const userIndex = ranking.findIndex(r => r.ldap === user.ldap);
    const userRank = userIndex >= 0 ? ranking[userIndex] : { 
      ldap: user.ldap, 
      score: this.store.state.counts.total 
    };
    
    const medal = userIndex === 0 ? "🥇" : 
                 userIndex === 1 ? "🥈" : 
                 userIndex === 2 ? "🥉" : 
                 `#${userIndex + 1 > 0 ? userIndex + 1 : "—"}`;
    
    const div = document.createElement("div");
    div.className = "rank-card rank-me";
    div.innerHTML = `
      <div class="rank-left">
        <div class="rank-medal">${medal}</div>
        <div><b>${userRank.ldap}</b><div class="rank-meta">casos: ${userRank.score}</div></div>
      </div>`;
    
    this.elements.miniRanking.appendChild(div);
  }
  
  // CORREGIDO: Renderizar vista de logros con rangos 50-250
  renderAchievementsView() {
    const achievements = this.store.state.achievements;
    const unlockedCount = achievements.unlocked.length;
    
    if (this.elements.achievementCount) {
      this.elements.achievementCount.textContent = `${unlockedCount}/12`;
    }
    
    // CORREGIDO: Definiciones de logros con nuevos rangos
    const achievementsByCategory = {
      on: [
        { id: 'on_50', name: 'Comunicador', desc: '50 casos ON', icon: '📞', target: 50 },
        { id: 'on_100', name: 'Conversador', desc: '100 casos ON', icon: '💬', target: 100 },
        { id: 'on_200', name: 'Maestro ON', desc: '200 casos ON', icon: '📻', target: 200 },
        { id: 'on_250', name: 'Leyenda ON', desc: '250 casos ON', icon: '🎯', target: 250, legendary: true }
      ],
      off: [
        { id: 'off_50', name: 'Investigador', desc: '50 casos OFF', icon: '📧', target: 50 },
        { id: 'off_100', name: 'Analista', desc: '100 casos OFF', icon: '🔍', target: 100 },
        { id: 'off_200', name: 'Detective', desc: '200 casos OFF', icon: '🕵️', target: 200 },
        { id: 'off_250', name: 'Leyenda OFF', desc: '250 casos OFF', icon: '🎖️', target: 250, legendary: true }
      ],
      level: [
        { id: 'level_10', name: 'Escalador', desc: '10 Level Up', icon: '✨', target: 10 },
        { id: 'level_25', name: 'Especialista', desc: '25 Level Up', icon: '⭐', target: 25 }
      ],
      streak: [
        { id: 'streak_3', name: 'Constante', desc: '3 días seguidos', icon: '🔥', target: 3 },
        { id: 'streak_7', name: 'Disciplinado', desc: '7 días seguidos', icon: '💪', target: 7 }
      ]
    };
    
    // Renderizar cada categoría
    Object.entries(achievementsByCategory).forEach(([category, items]) => {
      const container = this.elements[`achievements${category.charAt(0).toUpperCase() + category.slice(1)}`];
      if (!container) return;
      
      container.innerHTML = items.map(achievement => {
        const isUnlocked = achievements.unlocked.includes(achievement.id);
        const progress = achievements.progress[achievement.id];
        const isNewlyUnlocked = achievements.newlyUnlocked.includes(achievement.id);
        
        let status = 'locked';
        let progressWidth = 0;
        
        if (isUnlocked) {
          status = achievement.legendary ? 'legendary' : 'unlocked';
          progressWidth = 100;
        } else if (progress) {
          status = 'progress';
          progressWidth = progress.percentage;
        }
        
        return `
          <div class="achievement-item ${status} ${isNewlyUnlocked ? 'newly-unlocked' : ''}"
               data-tooltip="${achievement.desc}">
            <div class="achievement-icon">${achievement.icon}</div>
            <div class="achievement-name">${achievement.name}</div>
            <div class="achievement-desc">${achievement.desc}</div>
            <div class="achievement-progress-bar">
              <div class="achievement-progress-fill" style="width: ${progressWidth}%"></div>
            </div>
          </div>
        `;
      }).join('');
    });
    
    // Marcar botón de logros si hay nuevos
    const achievementsBtn = qs("#achievementsBtn");
    if (achievementsBtn) {
      if (achievements.newlyUnlocked.length > 0) {
        achievementsBtn.classList.add("has-new");
      } else {
        achievementsBtn.classList.remove("has-new");
      }
    }
  }
  
  // Renderizar vista de ranking completo con mensajes motivacionales
  renderRankingView() {
    if (!this.elements.rankingList) return;
    
    const ranking = this.computeRankingArray();
    const user = this.store.state.user;
    
    // Generar mensaje motivacional
    this.renderMotivationalMessage(ranking, user);
    
    this.elements.rankingList.innerHTML = "";
    
    ranking.forEach((item, index) => {
      const medal = index === 0 ? "🥇" : 
                   index === 1 ? "🥈" : 
                   index === 2 ? "🥉" : 
                   `#${index + 1}`;
      
      const isMe = user && item.ldap === user.ldap;
      const isActive = item.score > 0 || (item.lastTs && (Date.now() - item.lastTs) <= 60 * 60 * 1000);
      
      const row = document.createElement("div");
      row.className = "rank-item";
      
      // Marcar competidores cercanos
      if (user && !isMe && Math.abs(item.score - this.store.state.counts.total) <= 2) {
        row.classList.add("close-competitor");
      }
      
      row.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center">
          <div class="rank-medal">${medal}</div>
          <div>
            <div class="rank-ldap">${item.ldap}</div>
            <div class="rank-meta">Últ. caso: ${item.last || "N/A"} ${!isActive ? '💤' : ''}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800">${item.score}</div>
          <div class="rank-meta">Meta: ${item.goal ?? "N/A"}</div>
        </div>
      `;
      
      if (isMe) {
        row.style.outline = `2px solid ${this.store.getThemePrimaryColor()}`;
        row.style.background = "#fff";
      }
      
      if (!isActive) {
        row.style.opacity = "0.6";
      }
      
      this.elements.rankingList.appendChild(row);
    });
  }
  
  // CORREGIDO: Generar mensajes motivacionales
  renderMotivationalMessage(ranking, user) {
    if (!this.elements.motivationalMessage || !user) return;
    
    const userIndex = ranking.findIndex(r => r.ldap === user.ldap);
    const userScore = this.store.state.counts.total;
    
    let message = "¡Sigue así! 💪";
    
    if (userIndex === 0) {
      message = "¡Eres el líder! 👑 ¡Mantén el ritmo!";
    } else if (userIndex === 1) {
      const leader = ranking[0];
      const diff = leader.score - userScore;
      message = `🥈 ¡Estás a solo ${diff} caso${diff !== 1 ? 's' : ''} del primer lugar!`;
    } else if (userIndex >= 2) {
      const ahead = ranking[userIndex - 1];
      const diff = ahead.score - userScore;
      if (diff <= 3) {
        message = `🎯 ¡Estás a ${diff} caso${diff !== 1 ? 's' : ''} de alcanzar a ${ahead.ldap}!`;
      } else {
        message = `💪 ¡Acelera el paso! Puedes subir posiciones.`;
      }
    }
    
    const messageEl = this.elements.motivationalMessage.querySelector('.motivation-text');
    if (messageEl) {
      messageEl.textContent = message;
    }
  }
  
  // NUEVO: Panel del Líder Híbrido
  renderLeaderHybridDashboard(data) {
    const kpis = data.kpis || {};
    const ranking = data.ranking || [];
    
    // HEADER STATS
    if (this.elements.leaderTotalCases) {
      this.elements.leaderTotalCases.textContent = kpis.teamTotal || 0;
    }
    
    if (this.elements.leaderGoalPercent) {
      this.elements.leaderGoalPercent.textContent = `${kpis.teamEfficiency || 0}%`;
    }
    
    // Top performer
    if (ranking.length > 0) {
      const topRep = ranking[0];
      if (this.elements.leaderTopPerformer) {
        this.elements.leaderTopPerformer.textContent = topRep.ldap || '--';
      }
      if (this.elements.leaderTopCases) {
        this.elements.leaderTopCases.textContent = `${topRep.score || 0} casos`;
      }
    }
    
    // Activos vs inactivos
    const activeCount = ranking.filter(r => 
      r.score > 0 || (r.lastTs && (Date.now() - r.lastTs) <= 60 * 60 * 1000)
    ).length;
    
    if (this.elements.leaderActiveCount) {
      this.elements.leaderActiveCount.textContent = activeCount;
    }
    
    if (this.elements.leaderInactiveCount) {
      this.elements.leaderInactiveCount.textContent = `${ranking.length - activeCount} inactivos`;
    }
    
    // LIVE RANKING
    this.renderLiveRanking(ranking);
    
    // INSIGHTS AUTOMÁTICOS
    this.renderLeaderInsights(ranking, kpis);
  }
  
  renderLiveRanking(ranking) {
    if (!this.elements.leaderLiveRanking) return;
    
    // Mostrar solo top 4 para no saturar
    const topRanking = ranking.slice(0, 4);
    
    this.elements.leaderLiveRanking.innerHTML = topRanking.map((rep, index) => {
      const position = index === 0 ? "🥇" : 
                     index === 1 ? "🥈" : 
                     index === 2 ? "🥉" : 
                     `${index + 1}`;
      
      const percentage = rep.goal > 0 ? Math.round((rep.score / rep.goal) * 100) : 0;
      const isActive = rep.score > 0 || (rep.lastTs && (Date.now() - rep.lastTs) <= 60 * 60 * 1000);
      
      // Generar badges dinámicos
      let badges = [];
      
      if (rep.streak && rep.streak.current >= 3) {
        badges.push(`<span class="rank-badge streak">🔥 ${rep.streak.current} días</span>`);
      }
      
      if (percentage >= 100) {
        badges.push(`<span class="rank-badge goal">🎯 Meta alcanzada</span>`);
      }
      
      if (index < 3 && rep.score > 0) {
        badges.push(`<span class="rank-badge improvement">📈 Top performer</span>`);
      }
      
      return `
        <div class="live-rank-item rank-${index + 1} ${isActive ? '' : 'inactive'}">
          <div class="rank-position">${position}</div>
          <div class="rank-info">
            <div class="rank-name">${rep.ldap}</div>
            <div class="rank-details">
              ${badges.join(' ')}
              <span>Última actividad: ${this.getLastActivityText(rep.lastTs)}</span>
            </div>
            <div class="rank-progress">
              <div class="rank-progress-fill" style="width: ${Math.min(100, percentage)}%"></div>
            </div>
          </div>
          <div class="rank-cases">${rep.score || 0}</div>
        </div>
      `;
    }).join('');
  }
  
  renderLeaderInsights(ranking, kpis) {
    if (!this.elements.leaderInsights) return;
    
    const insights = this.generateInsights(ranking, kpis);
    
    this.elements.leaderInsights.innerHTML = insights.map(insight => `
      <div class="insight-item ${insight.type}">
        <div class="insight-icon">${insight.icon}</div>
        <div class="insight-text">${insight.text}</div>
      </div>
    `).join('');
  }
  
  generateInsights(ranking, kpis) {
    const insights = [];
    const teamTotal = kpis.teamTotal || 0;
    const activeMembers = ranking.filter(r => r.score > 0).length;
    
    // Insight de rendimiento general
    if (teamTotal > 0) {
      const avgPerPerson = Math.round(teamTotal / ranking.length);
      insights.push({
        type: 'info',
        icon: '📊',
        text: `El equipo ha procesado <span class="insight-highlight">${teamTotal} casos</span> con un promedio de ${avgPerPerson} por persona.`
      });
    }
    
    // Insight de miembros activos
    if (activeMembers > 0) {
      const percentage = Math.round((activeMembers / ranking.length) * 100);
      insights.push({
        type: percentage >= 80 ? 'positive' : 'warning',
        icon: percentage >= 80 ? '🔥' : '⚠️',
        text: `<span class="insight-highlight">${activeMembers} de ${ranking.length} miembros</span> (${percentage}%) están activos hoy.`
      });
    }
    
    // Insight de top performers
    if (ranking.length >= 3) {
      const topThree = ranking.slice(0, 3);
      const topThreeTotal = topThree.reduce((sum, r) => sum + (r.score || 0), 0);
      const topThreePercentage = teamTotal > 0 ? Math.round((topThreeTotal / teamTotal) * 100) : 0;
      
      insights.push({
          type: 'info',
          icon: '⭐',
          text: `Los <span class="insight-highlight">top 3 performers</span> representan el ${topThreePercentage}% del total de casos del equipo.`
        });
      }
      
      // Insight de rachas
      const membersWithStreaks = ranking.filter(r => r.streak && r.streak.current >= 3);
      if (membersWithStreaks.length > 0) {
        insights.push({
          type: 'positive',
          icon: '🔥',
          text: `<span class="insight-highlight">${membersWithStreaks.length} miembros</span> mantienen rachas de 3+ días consecutivos.`
        });
      }
      
      // Insight de oportunidades
      const lowPerformers = ranking.filter(r => r.goal > 0 && (r.score || 0) < (r.goal * 0.5));
      if (lowPerformers.length > 0) {
        insights.push({
          type: 'warning',
          icon: '💡',
          text: `${lowPerformers.length} miembros necesitan apoyo para alcanzar sus metas diarias.`
        });
      }
      
      return insights;
    }
    
    getLastActivityText(timestamp) {
      if (!timestamp) return 'Sin actividad';
      
      const now = Date.now();
      const diff = now - timestamp;
      const minutes = Math.floor(diff / (1000 * 60));
      const hours = Math.floor(diff / (1000 * 60 * 60));
      
      if (minutes < 5) return 'Ahora';
      if (minutes < 60) return `${minutes} min`;
      if (hours < 24) return `${hours}h`;
      return 'Más de 1 día';
    }
    
    // Renderizar historial con estadísticas semanales
    renderHistoryView() {
      if (!this.elements.historyList) return;
      
      const state = this.store.state;
      let cases = [...state.history];
      const filters = state.historyFilters;
      
      // Aplicar filtros
      if (filters.type) {
        cases = cases.filter(c => c.type === filters.type);
      }
      
      if (filters.date) {
        const targetDate = new Date(filters.date).toDateString();
        cases = cases.filter(c => new Date(c.ts).toDateString() === targetDate);
      }
      
      // Ordenar por más reciente
      cases.sort((a, b) => b.ts - a.ts);
      
      // Estadísticas
      const stats = {
        on: cases.filter(c => c.type === "on").length,
        off: cases.filter(c => c.type === "off").length,
        level: cases.filter(c => c.levelUp).length, // CORREGIDO: Contar Level Up como modificador
        total: cases.length
      };
      
      // Actualizar stats en UI
      if (this.elements.histStatsOn) this.elements.histStatsOn.textContent = stats.on;
      if (this.elements.histStatsOff) this.elements.histStatsOff.textContent = stats.off;
      if (this.elements.histStatsLevel) this.elements.histStatsLevel.textContent = stats.level;
      if (this.elements.histStatsTotal) this.elements.histStatsTotal.textContent = stats.total;
      
      // Renderizar lista
      if (cases.length === 0) {
        this.elements.historyList.innerHTML = `
          <div class="placeholder">
            <div>📝 No hay casos</div>
            <small class="muted">Los casos aparecerán aquí según los filtros.</small>
          </div>
        `;
      } else {
        this.elements.historyList.innerHTML = cases.map(c => {
          const typeEmoji = c.type === "on" ? "▷" : c.type === "off" ? "✉" : "✨";
          const levelUpIndicator = c.levelUp ? " + ✨" : "";
          const time = new Date(c.ts).toLocaleTimeString("es-CO", { 
            hour: "2-digit", 
            minute: "2-digit" 
          });
          
          return `
            <div class="history-item">
              <div class="history-header">
                <span class="case-type case-${c.type}">${typeEmoji}</span>
                <span class="case-id">${c.id}${levelUpIndicator}</span>
              </div>
              <div class="history-meta">${time}</div>
            </div>
          `;
        }).join('');
      }
    }
    
    // NUEVO: Renderizar gráfico semanal
    renderWeeklyChart() {
      if (!this.elements.weeklyChart) return;
      
      const weeklyData = this.store.state.weeklyData;
      const maxValue = Math.max(...weeklyData, 1);
      const totalWeek = weeklyData.reduce((sum, val) => sum + val, 0);
      
      if (this.elements.weeklyTotal) {
        this.elements.weeklyTotal.textContent = `${totalWeek} casos`;
      }
      
      // Generar barras
      const daysLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
      
      this.elements.weeklyChart.innerHTML = weeklyData.map((value, index) => {
        const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
        const dayLabel = daysLabels[index];
        
        return `
          <div class="chart-bar" 
               style="height: ${height}%" 
               data-value="${value}"
               title="${dayLabel}: ${value} casos">
            <div class="chart-day-label">${dayLabel}</div>
          </div>
        `;
      }).join('');
    }
    
    // Utilidades auxiliares
    computeRankingArray() {
      const ranking = Array.isArray(this.store.state.rankingFromScript) ? 
        [...this.store.state.rankingFromScript] : [];
      
      const user = this.store.state.user;
      if (user?.ldap) {
        const me = {
          ldap: user.ldap,
          score: this.store.state.counts.total,
          goal: this.store.state.dailyGoal,
          last: "Hoy",
          lastTs: Date.now()
        };
        
        const existingIndex = ranking.findIndex(r => r.ldap === user.ldap);
        if (existingIndex >= 0) {
          ranking[existingIndex] = me;
        } else {
          ranking.push(me);
        }
      }
      
      ranking.sort((a, b) => b.score - a.score || b.lastTs - a.lastTs);
      return ranking;
    }
    
    updateLastCaseId() {
      const lastId = this.store.state.lastCaseId || "—";
      
      [this.elements.lastCaseId, this.elements.lastCaseIdFocus].forEach(el => {
        if (el) el.textContent = lastId;
      });
    }
    
    applyTheme() {
      const state = this.store.state;
      
      // Limpiar clases de tema previas
      document.body.className = document.body.className.replace(/\btheme-\w+\b/g, "");
      
      // Aplicar nuevo tema
      const themeMap = {
        mint: "theme-mint", purple: "theme-purple", sunset: "theme-sunset", 
        ocean: "theme-ocean", pink: "theme-pink"
      };
      
      document.body.classList.add(themeMap[state.theme] || "theme-mint");
      
      // Aplicar clases de rol
      if (state.user?.role === "leader") {
        document.body.classList.add("leader", "leader-wide");
      } else {
        document.body.classList.remove("leader", "leader-wide");
      }
      
      // Aplicar color personalizado
      if (state.themeCustom) {
        document.body.style.setProperty("--primary", state.themeCustom);
      } else {
        document.body.style.removeProperty("--primary");
      }
      
      // Actualizar par temático
      this.store.state.themePair = CONFIG.THEME_ANIM[state.theme] || CONFIG.THEME_ANIM.mint;
    }
    
    // Celebraciones y notificaciones
    celebrateGoal(goalEmoji) {
      this.showToast(`¡Meta alcanzada! ${goalEmoji}`, "celebrate", 3000);
      this.showConfetti();
    }
    
    showToast(message, type = "info", duration = 3000) {
      if (!this.elements.toastHost) return;
      
      const toast = document.createElement("div");
      toast.className = `toast ${type}`;
      toast.textContent = message;
      
      this.elements.toastHost.appendChild(toast);
      
      setTimeout(() => {
        toast.classList.add("fade");
        toast.addEventListener("animationend", () => toast.remove(), { once: true });
      }, duration);
    }
    
    showConfetti() {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      
      for (let i = 0; i < 40; i++) {
        const piece = document.createElement("i");
        piece.style.left = (10 + Math.random() * 80) + "%";
        piece.style.top = (10 + Math.random() * 10) + "%";
        piece.style.background = i % 3 ? this.store.getThemePrimaryColor() : "#fff000";
        piece.style.transform = `translateY(0) rotate(${Math.random() * 180}deg)`;
        confetti.appendChild(piece);
      }
      
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 900);
    }
    
    renderClock() {
      if (!this.store.state.user || !this.elements.liveClock) return;
      
      this.elements.liveClock.textContent = new Date().toLocaleTimeString("es-CO", {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
    }
  }
  
  // ========================================
  // EVENT MANAGER - GESTIÓN DE EVENTOS
  // ========================================
  
  class EventManager {
    constructor(store, uiRenderer) {
      this.store = store;
      this.ui = uiRenderer;
      this.currentRole = "agent";
      this.leaderFilters = { on: true, off: true, level: true, active: false, search: "" };
    }
    
    initialize() {
      this.setupAuthenticationEvents();
      this.setupMainViewEvents();
      this.setupNavigationEvents();
      this.setupSettingsEvents();
      this.setupLeaderEvents();
      this.setupHistoryEvents();
      this.setupModalEvents();
      this.setupThemeEvents();
    }
    
    setupAuthenticationEvents() {
      const roleRep = this.ui.elements.roleRep;
      const roleLeader = this.ui.elements.roleLeader;
      const loginBtn = this.ui.elements.loginBtn;
      
      if (roleRep) {
        roleRep.addEventListener("click", () => this.toggleRole("agent"));
      }
      
      if (roleLeader) {
        roleLeader.addEventListener("click", () => this.toggleRole("leader"));
      }
      
      if (loginBtn) {
        loginBtn.addEventListener("click", () => this.handleLogin());
      }
    }
    
    toggleRole(role) {
      this.currentRole = role;
      
      const roleRep = this.ui.elements.roleRep;
      const roleLeader = this.ui.elements.roleLeader;
      const repFieldWrap = this.ui.elements.repFieldWrap;
      
      if (roleRep) roleRep.classList.toggle("active", role === "agent");
      if (roleLeader) roleLeader.classList.toggle("active", role === "leader");
      if (repFieldWrap) repFieldWrap.style.display = role === "agent" ? "block" : "none";
    }
    
    async handleLogin() {
      const leaderLdap = (this.ui.elements.leaderLdapInput?.value || "").trim().toLowerCase();
      
      if (!leaderLdap) {
        return this.showLoginError("Ingresa el LDAP del líder.");
      }
      
      if (this.currentRole === "agent") {
        await this.handleAgentLogin(leaderLdap);
      } else {
        await this.handleLeaderLogin(leaderLdap);
      }
    }
    
    async handleAgentLogin(leaderLdap) {
      const agentLdap = (this.ui.elements.ldapInput?.value || "").trim().toLowerCase();
      
      if (!agentLdap) {
        return this.showLoginError("Ingresa tu LDAP.");
      }
      
      const validation = await userManager.validateAgentLogin(agentLdap, leaderLdap);
      
      if (!validation.ok) {
        return this.showLoginError(validation.reason);
      }
      
      // Guardar usuario y inicializar sesión
      this.store.setUser(validation.user);
      
      // Mostrar elementos autenticados y iniciar reloj
      this.showAuthenticatedElements();
      this.startClock();
      
      // Ir a vista principal
      this.ui.setActiveView("main");
    }
    
    async handleLeaderLogin(leaderLdap) {
      const validation = await userManager.validateLeaderLogin(leaderLdap);
      
      this.store.setUser(validation.user);
      
      this.showAuthenticatedElements();
      this.startClock();
      
      // Ir a panel del líder
      this.ui.setActiveView("leader");
      
      if (!validation.hasTeam) {
        this.ui.showToast("No encontramos equipo para ese líder (verifica la hoja Usuarios).", "warn", 3000);
      }
    }
    
    showLoginError(message) {
      const errorEl = this.ui.elements.loginError;
      if (errorEl) {
        errorEl.textContent = message;
        setTimeout(() => errorEl.textContent = "", 4000);
      }
    }
    
    showAuthenticatedElements() {
      $$(".auth-only").forEach(el => el.hidden = false);
    }
    
    startClock() {
      this.ui.renderClock();
      setInterval(() => this.ui.renderClock(), 1000);
    }
    
    setupMainViewEvents() {
      // CORREGIDO: Level Up como modificador
      if (this.ui.elements.levelUpModifier) {
        this.ui.elements.levelUpModifier.addEventListener("click", () => {
          const isActive = this.store.toggleLevelUpMode();
          this.ui.updateLevelUpMode();
          
          if (isActive) {
            this.ui.showToast("✨ Level Up activado - El próximo caso será complejo", "info", 2000);
          } else {
            this.ui.showToast("Level Up desactivado", "info", 1500);
          }
        });
      }
      
      if (this.ui.elements.focusLevelUpModifier) {
        this.ui.elements.focusLevelUpModifier.addEventListener("click", () => {
          const isActive = this.store.toggleLevelUpMode();
          this.ui.updateLevelUpMode();
          
          if (isActive) {
            this.ui.showToast("✨ Level Up activado", "info", 2000);
          }
        });
      }
      
      // Botones de registro de casos (ahora pueden incluir Level Up)
      const caseButtons = [
        ["btnOn", "on", "main"], 
        ["btnOff", "off", "main"]
      ];
      
      caseButtons.forEach(([id, type, source]) => {
        const element = qs(`#${id}`);
        if (element) {
          element.addEventListener("click", () => this.recordCase(element, type, source));
        }
      });
      
      // Focus buttons
      const focusButtons = [
        ["focusOn", "on", "focus"], 
        ["focusOff", "off", "focus"]
      ];
      
      focusButtons.forEach(([id, type, source]) => {
        const element = qs(`#${id}`);
        if (element) {
          element.addEventListener("click", () => this.recordCase(element, type, source));
        }
      });
      
      // Enter key para registrar ON
      const caseIdInput = this.ui.elements.caseIdInput;
      const focusCaseId = this.ui.elements.focusCaseId;
      
      if (caseIdInput) {
        caseIdInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            this.recordCase(this.ui.elements.btnOn, "on", "main");
          }
        });
      }
      
      if (focusCaseId) {
        focusCaseId.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            this.recordCase(this.ui.elements.focusOn, "on", "focus");
          }
        });
      }
      
      // Undo button
      if (this.ui.elements.undoBtn) {
        this.ui.elements.undoBtn.addEventListener("click", () => this.undoLastCase());
      }
      
      // Goal editing
      const editGoalBtn = qs("#editGoalBtn");
      const goalSaveInline = qs("#goalSaveInline");
      const goalCancelInline = qs("#goalCancelInline");
      
      if (editGoalBtn) {
        editGoalBtn.addEventListener("click", () => this.toggleGoalInline(true));
      }
      
      if (goalSaveInline) {
        goalSaveInline.addEventListener("click", () => {
          const goalInput = qs("#goalInputInline");
          if (goalInput) {
            this.store.setDailyGoal(goalInput.value);
            this.toggleGoalInline(false);
            this.ui.renderMainView();
          }
        });
      }
      
      if (goalCancelInline) {
        goalCancelInline.addEventListener("click", () => this.toggleGoalInline(false));
      }
    }
    
    // CORREGIDO: Registro de casos con Level Up
    recordCase(buttonElement, type, source) {
      const user = this.store.state.user;
      if (!user || user.role !== "agent") return;
      
      // Determinar input según la fuente
      const inputElement = source === "focus" ? 
        this.ui.elements.focusCaseId : 
        this.ui.elements.caseIdInput;
      
      const caseId = this.requireCaseId(inputElement);
      if (!caseId) return;
      
      const isLevelUp = this.store.state.levelUpMode;
      
      // Trigger animation
      this.triggerButtonAnimation(buttonElement, type);
      
      // Actualizar datos
      this.store.updateCounts(type);
      this.store.addToHistory(type, caseId);
      
      // CORREGIDO: Registrar en backend con flag Level Up
      apiClient.registerCase(user.ldap, user.leaderLdap, type, caseId, isLevelUp);
      
      // Mostrar feedback visual
      const levelUpText = isLevelUp ? " + Level Up" : "";
      const emoji = type === "on" ? "▷" : "✉";
      this.ui.showToast(`${emoji} ${caseId}${levelUpText} registrado`, "info", 2000);
      
      // Limpiar input
      inputElement.value = "";
      
      // Actualizar UI
      this.ui.renderMainView();
      
      // Verificar logros
      const newAchievements = this.store.checkAchievements();
      if (newAchievements.length > 0) {
        this.celebrateAchievements(newAchievements);
      }
    }
    
    requireCaseId(inputElement) {
      const value = (inputElement.value || "").trim();
      
      if (!value) {
        inputElement.classList.add("invalid");
        setTimeout(() => inputElement.classList.remove("invalid"), 400);
        inputElement.focus();
        return null;
      }
      
      return value;
    }
    
    triggerButtonAnimation(buttonElement, type) {
      if (!buttonElement) return;
      
      const animations = {
        on: "ripple",
        off: "slide"
      };
      
      const animClass = animations[type];
      if (animClass) {
        buttonElement.classList.add(animClass);
        buttonElement.addEventListener("animationend", () => {
          buttonElement.classList.remove(animClass);
        }, { once: true });
      }
    }
    
    undoLastCase() {
      const success = this.store.undoLastCase();
      
      if (success) {
        this.ui.renderMainView();
        this.ui.showToast("Caso eliminado", "info", 2000);
      } else {
        this.ui.showToast("No hay casos para deshacer", "warn", 2000);
      }
    }
    
    toggleGoalInline(show) {
      const goalInline = qs("#goalInline");
      const goalInputInline = qs("#goalInputInline");
      
      if (goalInline) {
        goalInline.hidden = !show;
        
        if (show && goalInputInline) {
          goalInputInline.value = String(this.store.state.dailyGoal);
          goalInputInline.focus();
        }
      }
    }
    
    celebrateAchievements(achievements) {
      achievements.forEach(achievement => {
        const legendaryText = achievement.legendary ? " LEGENDARIO" : "";
        this.ui.showToast(
          `🎖️ ¡Logro${legendaryText} desbloqueado! ${achievement.icon} ${achievement.name}`, 
          "celebrate", 
          4000
        );
      });
      
      // Confetti para múltiples logros o legendarios
      if (achievements.length >= 2 || achievements.some(a => a.legendary)) {
        this.ui.showConfetti();
      }
    }
    
    setupNavigationEvents() {
      // Botones de navegación principal
      const navButtons = [
        ["achievementsBtn", "achievements"],
        ["rankingBtn", "ranking"], 
        ["settingsBtn", "settings"],
        ["historyBtn", "history"]
      ];
      
      navButtons.forEach(([id, view]) => {
        const element = qs(`#${id}`);
        if (element) {
          element.addEventListener("click", () => {
            // Solo agentes pueden ir a settings
            if (view === "settings" && this.store.state.user?.role !== "agent") {
              return;
            }
            
            this.ui.setActiveView(view);
            
            // Limpiar logros recién desbloqueados al entrar a achievements
            if (view === "achievements") {
              this.store.clearNewlyUnlockedAchievements();
              this.ui.renderAchievementsView();
            }
          });
        }
      });
      
      // Botones de retroceso con data-back
      $$("[data-back]").forEach(button => {
        button.addEventListener("click", () => {
          const targetView = button.dataset.back || "main";
          this.ui.setActiveView(targetView);
        });
      });
      
      // Focus mode
      const focusBtn = qs("#focusBtn");
      const focusBackBtn = qs("#focusBackBtn");
      
      if (focusBtn) {
        focusBtn.addEventListener("click", () => this.ui.setActiveView("focus"));
      }
      
      if (focusBackBtn) {
        focusBackBtn.addEventListener("click", () => this.ui.setActiveView("main"));
      }
    }
    
    setupHistoryEvents() {
      // NUEVO: Botón de estadísticas semanales
      if (this.ui.elements.weeklyStatsBtn) {
        this.ui.elements.weeklyStatsBtn.addEventListener("click", () => {
          if (this.ui.elements.weeklyStatsPanel) {
            this.ui.elements.weeklyStatsPanel.hidden = false;
            this.ui.renderWeeklyChart();
          }
        });
      }
      
      if (this.ui.elements.closeWeeklyStats) {
        this.ui.elements.closeWeeklyStats.addEventListener("click", () => {
          if (this.ui.elements.weeklyStatsPanel) {
            this.ui.elements.weeklyStatsPanel.hidden = true;
          }
        });
      }
      
      // Toggle filters
      const historyFilters = qs("#historyFilters");
      const historyFiltersBar = qs("#historyFiltersBar");
      
      if (historyFilters && historyFiltersBar) {
        historyFilters.addEventListener("click", () => {
          historyFiltersBar.hidden = !historyFiltersBar.hidden;
        });
      }
      
      // Date filter
      if (this.ui.elements.historyDate) {
        this.ui.elements.historyDate.addEventListener("change", () => {
          this.store.state.historyFilters.date = this.ui.elements.historyDate.value;
          this.ui.renderHistoryView();
        });
      }
      
      // Type filter  
      if (this.ui.elements.historyType) {
        this.ui.elements.historyType.addEventListener("change", () => {
          this.store.state.historyFilters.type = this.ui.elements.historyType.value;
          this.ui.renderHistoryView();
        });
      }
      
      // Clear filters
      const clearHistoryFiltersBtn = qs("#clearHistoryFilters");
      if (clearHistoryFiltersBtn) {
        clearHistoryFiltersBtn.addEventListener("click", () => {
          this.store.state.historyFilters = { type: "", date: "" };
          if (this.ui.elements.historyDate) this.ui.elements.historyDate.value = "";
          if (this.ui.elements.historyType) this.ui.elements.historyType.value = "";
          this.ui.renderHistoryView();
        });
      }
    }
    
    setupSettingsEvents() {
      // Theme picker
      const themePicker = this.ui.elements.themePicker;
      if (themePicker) {
        themePicker.addEventListener("click", (e) => this.handleThemeSelection(e));
      }
      
      // Custom color
      const customColor = qs("#customColor");
      if (customColor) {
        customColor.addEventListener("input", () => {
          const color = customColor.value;
          document.body.style.setProperty("--primary", color);
          this.store.state.themeCustom = color;
          this.store.saveState();
          this.ui.renderMainView();
        });
      }
      
      // Reset theme
      const resetThemeBtn = qs("#resetThemeBtn");
      if (resetThemeBtn) {
        resetThemeBtn.addEventListener("click", () => {
          document.body.style.removeProperty("--primary");
          this.store.state.themeCustom = null;
          this.store.saveState();
          this.ui.applyTheme();
          this.ui.renderMainView();
        });
      }
      
      // Extension settings
      const extensionSettingsBtn = qs("#extensionSettingsBtn");
      if (extensionSettingsBtn) {
        extensionSettingsBtn.addEventListener("click", () => {
          chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
        });
      }
      
      // Logout
      const logoutBtn = qs("#logoutBtn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
          if (confirm("¿Cerrar sesión?")) {
            this.store.state.user = null;
            this.store.saveState();
            location.reload();
          }
        });
      }
    }
    
    handleThemeSelection(event) {
      const swatch = event.target.closest(".swatch");
      if (!swatch) return;
      
      // Trigger pulse animation
      swatch.classList.add("pulse");
      swatch.addEventListener("animationend", () => swatch.classList.remove("pulse"), { once: true });
      
      // Handle theme change
      if (swatch.dataset.theme) {
        this.store.state.theme = swatch.dataset.theme;
        this.store.state.themeCustom = null;
        this.store.state.progressMode = "theme";
        this.store.state.themePair = CONFIG.THEME_ANIM[this.store.state.theme] || CONFIG.THEME_ANIM.mint;
      } else if (swatch.dataset.anim) {
        this.store.state.animation = swatch.dataset.anim;
        this.store.state.progressMode = "anim";
        this.store.state.celebrated = false; // Reset para ver nuevo emoji
      }
      
      this.store.saveState();
      this.ui.applyTheme();
      this.ui.renderMainView();
    }
    
    setupLeaderEvents() {
      // Los eventos del líder se manejan automáticamente con el polling
      console.log('[EventManager] Leader events initialized');
    }
    
    setupModalEvents() {
      const helpBtn = qs("#helpBtn");
      const helpModal = qs("#helpModal");
      const helpClose = qs("#helpClose");
      const helpOk = qs("#helpOk");
      
      if (helpBtn && helpModal) {
        helpBtn.addEventListener("click", () => helpModal.hidden = false);
      }
      
      [helpClose, helpOk].forEach(btn => {
        if (btn && helpModal) {
          btn.addEventListener("click", () => helpModal.hidden = true);
        }
      });
    }
    
    setupThemeEvents() {
      const openPalettes = qs("#openPalettes");
      const themeCard = qs("#themeCard");
      
      if (openPalettes && themeCard) {
        openPalettes.addEventListener("click", () => {
          themeCard.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    }
  }
  
  // ========================================
// INICIALIZACIÓN PRINCIPAL
// ========================================

class App {
  constructor() {
    this.store = store;
    this.apiClient = apiClient;
    this.userManager = userManager;
    this.uiRenderer = new UIRenderer(this.store);
    this.eventManager = new EventManager(this.store, this.uiRenderer);
  }
  
  async initialize() {
    console.log('[App] Iniciando Case Counter Pro v2.0...');
    
    try {
      // Cargar estado
      await this.store.loadState();
      
      // Configurar suscriptores del store
      this.setupStoreSubscribers();
      
      // Inicializar eventos
      this.eventManager.initialize();
      
      // Aplicar tema inicial
      this.uiRenderer.applyTheme();
      
      // Determinar vista inicial
      await this.determineInitialView();
      
      console.log('[App] Inicialización completa');
      
    } catch (error) {
      console.error('[App] Error en inicialización:', error);
      this.uiRenderer.showToast("Error al inicializar la aplicación", "warn", 5000);
    }
  }
  
  setupStoreSubscribers() {
    this.store.subscribe((event, data, state) => {
      switch (event) {
        case 'levelup-mode-changed':
          // Actualizar UI cuando cambia el modo Level Up
          this.uiRenderer.updateLevelUpMode();
          break;
          
        case 'goal-met':
          // Meta alcanzada
          console.log('[App] Meta diaria alcanzada!');
          break;
          
        case 'achievements-unlocked':
          // Nuevos logros desbloqueados
          console.log('[App] Nuevos logros:', data.length);
          break;
          
        case 'counts-updated':
          // Actualizar métricas de hora cuando cambian los conteos
          this.uiRenderer.renderHourlyMetrics();
          break;
          
        case 'team-data-updated':
          // Datos del equipo actualizados
          this.uiRenderer.renderHourlyMetrics();
          break;
          
        default:
          console.log(`[App] Store event: ${event}`, data);
      }
    });
  }
  
  async determineInitialView() {
    const user = this.store.state.user;
    
    if (user) {
      // Usuario autenticado
      this.eventManager.showAuthenticatedElements();
      this.eventManager.startClock();
      
      const targetView = user.role === "leader" ? "leader" : 
                        (this.store.state.lastView || "main");
      
      this.uiRenderer.setActiveView(targetView);
      
    } else {
      // Usuario no autenticado
      $$(".auth-only").forEach(el => el.hidden = true);
      this.uiRenderer.setActiveView("login");
    }
  }
}

// ========================================
// PUNTO DE ENTRADA
// ========================================

// Inicializar aplicación cuando el DOM esté listo
document.addEventListener("DOMContentLoaded", () => {
  const app = new App();
  app.initialize();
});

// ========================================
// FUNCIONES GLOBALES DE COMPATIBILIDAD
// ========================================

// Mantener compatibilidad con funciones que podrían ser llamadas desde el HTML
window.showLoginError = function(msg) {
  const loginError = qs("#loginError");
  if (loginError) {
    loginError.textContent = msg;
    setTimeout(() => loginError.textContent = "", 4000);
  }
};

// Función global para debugging
window.debugCCP = function() {
  console.log('=== Case Counter Pro v2.0 Debug Info ===');
  console.log('Store State:', store.getState());
  console.log('Users Cache:', store.usersCache);
  console.log('API Client:', apiClient);
  console.log('==========================================');
};

// Event listeners adicionales para casos edge
window.addEventListener('beforeunload', () => {
  // Guardar estado antes de cerrar
  if (store) {
    store.saveState();
  }
});

// Manejar errores globales
window.addEventListener('error', (event) => {
  console.error('[App] Error global:', event.error);
  
  // Mostrar toast si la UI está disponible
  try {
    const app = window.app;
    if (app && app.uiRenderer) {
      app.uiRenderer.showToast("Se produjo un error inesperado", "warn", 3000);
    }
  } catch {
    // Silencioso si no se puede mostrar el toast
  }
});

// Debugging helpers para desarrollo
if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Solo en extensión
  window.exportState = function() {
    const state = store.getState();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ccp-state-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  window.importState = function(jsonString) {
    try {
      const newState = JSON.parse(jsonString);
      store.state = { ...store.getDefaultState(), ...newState };
      store.saveState();
      location.reload();
    } catch (error) {
      console.error('Error importing state:', error);
    }
  };
}