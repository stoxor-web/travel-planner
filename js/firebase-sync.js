(function(){
  'use strict';

  const SDK_VERSION = '10.12.5';
  const USERS = 'travelPlannerUsers';
  const COMMUNITY = 'communityTrips';
  const ADMIN_EMAIL = 'lucas.scribe01@gmail.com';

  let app = null;
  let auth = null;
  let db = null;
  let modules = null;
  let currentUser = null;
  let status = 'Initialisation Firebase…';
  let initPromise = null;
  let authReadyResolve = null;

  const authReady = new Promise(resolve => { authReadyResolve = resolve; });
  const listeners = new Set();

  const clean = c => ({
    apiKey: String(c?.apiKey || '').trim(),
    authDomain: String(c?.authDomain || '').trim(),
    projectId: String(c?.projectId || '').trim(),
    appId: String(c?.appId || '').trim(),
    storageBucket: String(c?.storageBucket || '').trim(),
    messagingSenderId: String(c?.messagingSenderId || '').trim(),
    measurementId: String(c?.measurementId || '').trim()
  });

  const getConfig = () => clean(window.TRAVEL_PLANNER_FIREBASE_CONFIG || {});
  const isConfigured = () => {
    const c = getConfig();
    return Boolean(c.apiKey && c.authDomain && c.projectId && c.appId);
  };

  function providerLabel(user = currentUser) {
    const provider = user?.providerData?.[0]?.providerId || '';
    if (provider.includes('password')) return 'e-mail';
    if (provider.includes('google')) return 'Google';
    return user ? 'Firebase' : '';
  }

  function isAdmin() {
    return (currentUser?.email || '').toLowerCase() === ADMIN_EMAIL;
  }

  function emit() {
    const payload = {
      user: currentUser,
      status,
      configured: isConfigured(),
      isAdmin: isAdmin(),
      provider: providerLabel()
    };
    listeners.forEach(fn => fn(payload));
  }

  async function loadModules() {
    if (modules) return modules;
    const [appM, authM, fsM] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore.js`)
    ]);
    modules = { appM, authM, fsM };
    return modules;
  }

  async function init() {
    if (auth && db) return { auth, db, user: currentUser };
    if (initPromise) return initPromise;

    initPromise = (async () => {
      if (!isConfigured()) throw new Error('Firebase n’est pas configuré dans js/firebase-config.js.');
      const { appM, authM, fsM } = await loadModules();
      app = appM.getApps().length ? appM.getApp() : appM.initializeApp(getConfig());
      auth = authM.getAuth(app);
      db = fsM.getFirestore(app);

      try {
        await authM.setPersistence(auth, authM.browserLocalPersistence);
      } catch (error) {
        console.warn(error);
      }

      try {
        await authM.getRedirectResult(auth);
      } catch (error) {
        console.warn(error);
      }

      authM.onAuthStateChanged(auth, user => {
        currentUser = user;
        status = user
          ? `Connecté avec ${user.email || user.displayName || 'un compte Firebase'}.`
          : 'Connexion requise.';
        authReadyResolve?.(user);
        emit();
      });

      status = 'Firebase prêt.';
      emit();
      return { auth, db, user: currentUser };
    })();

    return initPromise;
  }

  async function waitForAuthState() {
    await init();
    return authReady;
  }

  async function signIn() {
    const { auth } = await init();
    const { authM } = await loadModules();
    const provider = new authM.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await authM.signInWithPopup(auth, provider);
      currentUser = result.user;
      status = 'Connexion Google réussie.';
      emit();
      return currentUser;
    } catch (error) {
      if (['auth/popup-blocked', 'auth/cancelled-popup-request'].includes(error.code)) {
        await authM.signInWithRedirect(auth, provider);
        return null;
      }
      throw normalizeAuthError(error);
    }
  }

  async function signInWithEmail(email, password) {
    const { auth } = await init();
    const { authM } = await loadModules();
    try {
      const result = await authM.signInWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''));
      currentUser = result.user;
      status = 'Connexion e-mail réussie.';
      emit();
      return currentUser;
    } catch (error) {
      throw normalizeAuthError(error);
    }
  }

  async function registerWithEmail(email, password) {
    const { auth } = await init();
    const { authM } = await loadModules();
    try {
      const result = await authM.createUserWithEmailAndPassword(auth, String(email || '').trim(), String(password || ''));
      currentUser = result.user;
      status = 'Compte e-mail créé.';
      emit();
      return currentUser;
    } catch (error) {
      throw normalizeAuthError(error);
    }
  }

  async function resetPassword(email) {
    const { auth } = await init();
    const { authM } = await loadModules();
    try {
      await authM.sendPasswordResetEmail(auth, String(email || '').trim());
      status = 'E-mail de réinitialisation envoyé.';
      emit();
    } catch (error) {
      throw normalizeAuthError(error);
    }
  }

  async function signOut() {
    const { auth } = await init();
    const { authM } = await loadModules();
    await authM.signOut(auth);
    currentUser = null;
    status = 'Déconnecté.';
    emit();
  }

  function normalizeAuthError(error) {
    const code = error?.code || '';
    const messages = {
      'auth/invalid-email': 'Adresse e-mail invalide.',
      'auth/missing-email': 'Adresse e-mail manquante.',
      'auth/missing-password': 'Mot de passe manquant.',
      'auth/weak-password': 'Mot de passe trop faible. Utilise au moins 6 caractères.',
      'auth/email-already-in-use': 'Cette adresse e-mail est déjà utilisée. Connecte-toi ou réinitialise le mot de passe.',
      'auth/invalid-credential': 'Identifiants incorrects ou compte inexistant.',
      'auth/user-not-found': 'Aucun compte ne correspond à cette adresse.',
      'auth/wrong-password': 'Mot de passe incorrect.',
      'auth/too-many-requests': 'Trop de tentatives. Réessaie plus tard.',
      'auth/operation-not-allowed': 'Ce mode de connexion n’est pas activé dans Firebase.',
      'auth/unauthorized-domain': 'Ce domaine n’est pas autorisé dans Firebase Authentication.'
    };
    return new Error(messages[code] || error?.message || 'Connexion impossible.');
  }

  function requireUser() {
    if (!currentUser) throw new Error('Connecte-toi avec Google ou e-mail.');
    if (!db || !modules) throw new Error('Firebase non initialisé.');
  }

  function userRef() {
    const { fsM } = modules;
    return fsM.doc(db, USERS, currentUser.uid);
  }

  function sanitize(state) {
    return JSON.parse(JSON.stringify({
      version: state.version || 415,
      activeTripId: state.activeTripId || null,
      settings: state.settings || {},
      trips: Array.isArray(state.trips) ? state.trips : []
    }));
  }

  async function saveState(state) {
    await init();
    requireUser();
    const { fsM } = modules;
    await fsM.setDoc(userRef(), {
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      schema: 'travelPlannerState',
      schemaVersion: 1,
      clientUpdatedAt: new Date().toISOString(),
      updatedAt: fsM.serverTimestamp(),
      state: sanitize(state)
    });
    status = 'Sauvegardé dans Firebase.';
    emit();
  }

  async function loadState() {
    await init();
    requireUser();
    const { fsM } = modules;
    const snap = await fsM.getDoc(userRef());
    if (!snap.exists()) return null;
    const data = snap.data();
    status = 'Données chargées depuis Firebase.';
    emit();
    return { state: data.state || null, clientUpdatedAt: data.clientUpdatedAt || '' };
  }

  async function deleteState() {
    await init();
    requireUser();
    const { fsM } = modules;
    await fsM.deleteDoc(userRef());
    status = 'Données supprimées.';
    emit();
  }

  function publicTrip(trip, options = {}) {
    return JSON.parse(JSON.stringify({
      id: trip.id,
      name: options.title || trip.name,
      title: options.title || trip.name,
      area: options.country || trip.area || '',
      country: options.country || trip.area || '',
      category: options.category || 'roadtrip',
      coverImage: options.coverImage || trip.coverImage || '',
      description: options.description || trip.description || '',
      currency: trip.currency || '€',
      status: trip.status || 'prévu',
      style: trip.style || 'équilibré',
      pace: trip.pace || 'normal',
      startDate: trip.startDate || '',
      endDate: trip.endDate || '',
      travellers: trip.travellers || 1,
      maxBudget: options.hideBudget ? 0 : (trip.maxBudget || 0),
      steps: (trip.steps || []).map(s => ({
        id: s.id,
        order: s.order,
        name: s.name,
        type: s.type,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        arrivalDate: s.arrivalDate,
        arrivalTime: s.arrivalTime,
        departureDate: s.departureDate,
        departureTime: s.departureTime,
        cost: options.hideBudget ? 0 : (s.cost || 0),
        priority: s.priority,
        color: s.color,
        transportToNext: s.transportToNext,
        segmentCost: options.hideBudget ? 0 : (s.segmentCost || 0),
        segmentReference: s.segmentReference || '',
        segmentNote: s.segmentNote || ''
      })),
      expenses: options.hideBudget ? [] : (trip.expenses || []).map(e => ({
        label: e.label,
        category: e.category,
        planned: e.planned,
        actual: e.actual,
        date: e.date,
        status: e.status
      })),
      checklists: [],
      publishedOptions: {
        hideBudget: Boolean(options.hideBudget),
        hideNotes: Boolean(options.hideNotes),
        allowCopy: options.allowCopy !== false
      }
    }));
  }

  async function publishCommunityTrip(trip, options = {}) {
    await init();
    requireUser();
    const { fsM } = modules;
    const payload = {
      ownerUid: currentUser.uid,
      ownerEmail: currentUser.email || '',
      authorName: currentUser.displayName || currentUser.email || 'Utilisateur',
      title: options.title || trip.name || 'Voyage partagé',
      country: options.country || trip.area || '',
      category: options.category || 'roadtrip',
      coverImage: options.coverImage || trip.coverImage || '',
      description: options.description || trip.description || '',
      allowCopy: options.allowCopy !== false,
      hideBudget: Boolean(options.hideBudget),
      score: 0,
      votes: {},
      createdAt: fsM.serverTimestamp(),
      updatedAt: fsM.serverTimestamp(),
      trip: publicTrip(trip, options)
    };
    const ref = await fsM.addDoc(fsM.collection(db, COMMUNITY), payload);
    return { id: ref.id, ...payload };
  }

  async function listCommunityTrips() {
    await init();
    const { fsM } = modules;
    const snap = await fsM.getDocs(fsM.collection(db, COMMUNITY));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function voteCommunityTrip(id, value) {
    await init();
    requireUser();
    const { fsM } = modules;
    const ref = fsM.doc(db, COMMUNITY, id);
    await fsM.runTransaction(db, async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Publication introuvable.');
      const data = snap.data();
      const votes = { ...(data.votes || {}) };
      const next = Number(value) || 0;
      if (votes[currentUser.uid] === next) delete votes[currentUser.uid];
      else votes[currentUser.uid] = next;
      const score = Object.values(votes).reduce((a, b) => a + Number(b || 0), 0);
      tx.update(ref, { votes, score, updatedAt: fsM.serverTimestamp() });
    });
  }

  async function deleteCommunityTrip(id) {
    await init();
    requireUser();
    const { fsM } = modules;
    await fsM.deleteDoc(fsM.doc(db, COMMUNITY, id));
  }

  function getUser() { return currentUser; }
  function getStatus() { return status; }
  function getProviderLabel() { return providerLabel(); }
  function onAuthChange(fn) {
    listeners.add(fn);
    fn({ user: currentUser, status, configured: isConfigured(), isAdmin: isAdmin(), provider: providerLabel() });
    return () => listeners.delete(fn);
  }

  window.TravelCloudSync = {
    init,
    waitForAuthState,
    signIn,
    signInWithEmail,
    registerWithEmail,
    resetPassword,
    signOut,
    saveState,
    loadState,
    deleteState,
    publishCommunityTrip,
    listCommunityTrips,
    voteCommunityTrip,
    deleteCommunityTrip,
    getUser,
    getStatus,
    getProviderLabel,
    isAdmin,
    onAuthChange,
    isConfigured
  };
})();
