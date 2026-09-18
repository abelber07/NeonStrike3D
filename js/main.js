// js/main.js
import { UIManager } from './ui.js';
import { GameEngine } from './game.js';
import {
    registrarCuenta,
    iniciarSesion,
    loginGoogle,
    obtenerResultadoGoogle,
    escucharAuth,
    prepararAutenticacionManual,
    configurarPersistencia,
    cerrarSesion,
    obtenerPerfilUsuario,
    actualizarPerfil,
    comprarItem,
    reclamarRecompensa,
    guardarEstadisticasPartida
} from './firebase.js';

const ui = new UIManager();
const game = new GameEngine(ui);
let currentUser = null;
let currentProfile = null;
let pendingGoogleNickname = '';
const rememberDevice = document.getElementById('remember-device');
const rememberStorageKey = 'neonstrike-remember-device';
rememberDevice.checked = localStorage.getItem(rememberStorageKey) === 'true';
rememberDevice.addEventListener('change', () => {
    localStorage.setItem(rememberStorageKey, String(rememberDevice.checked));
});

const setRememberDevice = async (remember) => {
    localStorage.setItem(rememberStorageKey, String(remember));
    await configurarPersistencia(remember);
};
const shopItems = [
    { id: 'neon-blue', nombre: 'Pulso Ártico', descripcion: 'Skin de arma azul eléctrico.', categoria: 'skin', icon: '🔷', precio: 250 },
    { id: 'neon-pink', nombre: 'Rayo Rosa', descripcion: 'Skin de arma con brillo magenta.', categoria: 'skin', icon: '💗', precio: 400 },
    { id: 'nova-burst', nombre: 'Nova Burst', descripcion: 'Efecto de eliminación explosivo.', categoria: 'killEffect', icon: '💥', precio: 350 },
    { id: 'tag-hunter', nombre: '[HUNTER]', descripcion: 'Tag para destacar en el marcador.', categoria: 'tag', icon: '🎯', precio: 200 }
    ,{ id: 'void-purple', nombre: 'Vacío Púrpura', descripcion: 'Skin de arma de energía oscura.', categoria: 'skin', icon: '🟣', precio: 600 }
    ,{ id: 'ion-trail', nombre: 'Rastro Iónico', descripcion: 'Efecto de eliminación eléctrico.', categoria: 'killEffect', icon: '⚡', precio: 550 }
    ,{ id: 'tag-vanguard', nombre: '[VANGUARD]', descripcion: 'Tag de los supervivientes de la campaña.', categoria: 'tag', icon: '🛡️', precio: 450 }
];
const battlePassTiers = [
    { nivel: 1, icon: '◈', recompensa: '100 monedas', monedas: 100 },
    { nivel: 2, icon: '🔷', recompensa: 'Pulso Ártico', itemId: 'neon-blue' },
    { nivel: 3, icon: '◈', recompensa: '200 monedas', monedas: 200 },
    { nivel: 4, icon: '💥', recompensa: 'Nova Burst', itemId: 'nova-burst' },
    { nivel: 5, icon: '★', recompensa: '300 monedas', monedas: 300 },
    { nivel: 6, icon: '🟣', recompensa: 'Vacío Púrpura', itemId: 'void-purple' },
    { nivel: 7, icon: '◈', recompensa: '500 monedas', monedas: 500 },
    { nivel: 8, icon: '⚡', recompensa: 'Rastro Iónico', itemId: 'ion-trail' },
    { nivel: 9, icon: '⬢', recompensa: '700 monedas', monedas: 700 },
    { nivel: 10, icon: '🛡️', recompensa: '[VANGUARD]', itemId: 'tag-vanguard' }
];

const refreshContent = () => {
    if (!currentProfile) return;
    ui.renderItems('shop-grid', shopItems, null, handleShopItem);
    const category = document.querySelector('#locker-tabs .chip.active')?.dataset.cat || 'skin';
    const defaults = {
        skin: { id: 'default', nombre: 'Estándar', descripcion: 'Equipo inicial de NeonStrike.', categoria: 'skin', icon: '⚡', precio: 0 },
        killEffect: { id: 'default', nombre: 'Sin efecto', descripcion: 'Eliminación sin efecto equipado.', categoria: 'killEffect', icon: '○', precio: 0 },
        tag: { id: 'default', nombre: '[N00B]', descripcion: 'Tag inicial.', categoria: 'tag', icon: '◇', precio: 0 }
    };
    const lockerItems = [defaults[category], ...shopItems].filter(item =>
        item.categoria === category && (item.id === 'default' || (currentProfile.inventario || []).includes(item.id))
    );
    const equipped = category === 'skin' ? currentProfile.skinEquipada : category === 'killEffect' ? currentProfile.efectoKill : currentProfile.tagEquipado === '[N00B]' ? 'default' : currentProfile.tagEquipado === '[HUNTER]' ? 'tag-hunter' : 'tag-vanguard';
    ui.renderItems('locker-grid', lockerItems, equipped, handleLockerItem);
    ui.renderBattlePass(battlePassTiers.map(tier => ({ ...tier, reclamado: (currentProfile.recompensas || []).includes(tier.nivel) })), currentProfile.nivel || 1, claimBattlePass);
};

const persistProfile = async (profile) => {
    currentProfile = profile;
    game.playerName = profile.nombre || 'Jugador';
    ui.updatePlayerUI(profile);
    refreshContent();
};

async function handleShopItem(item) {
    if (!currentUser || !currentProfile) return;
    try {
        await persistProfile(await comprarItem(currentUser.uid, item.id));
    } catch (error) {
        console.error(error);
    }
}

async function handleLockerItem(item) {
    if (!currentUser || !currentProfile || !(currentProfile.inventario || []).includes(item.id)) return;
    const changes = item.categoria === 'skin' ? { skinEquipada: item.id } : item.categoria === 'killEffect' ? { efectoKill: item.id } : { tagEquipado: item.id === 'default' ? '[N00B]' : item.id === 'tag-vanguard' ? '[VANGUARD]' : '[HUNTER]' };
    try {
        await actualizarPerfil(currentUser.uid, changes);
        await persistProfile({ ...currentProfile, ...changes });
    } catch (error) {
        console.error(error);
    }
};

async function claimBattlePass(tier) {
    if (!currentUser || !currentProfile) return;
    try {
        await persistProfile(await reclamarRecompensa(currentUser.uid, tier.nivel));
    } catch (error) {
        console.error(error);
    }
}

// --- LOGIN ---
const getAuthFields = () => ({
    nickname: document.getElementById('input-nickname').value.trim(),
    email: document.getElementById('input-email').value.trim(),
    password: document.getElementById('input-password').value
});

const showAuthError = (error) => {
    const messages = {
        'auth/email-already-in-use': 'Ese correo ya tiene una cuenta.',
        'auth/invalid-credential': 'Correo o contraseña incorrectos.',
        'auth/invalid-email': 'Introduce un correo válido.',
        'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
        'auth/operation-not-allowed': 'Activa el proveedor de acceso correspondiente en Firebase Authentication.',
        'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication.',
        'auth/popup-blocked': 'El navegador ha bloqueado la ventana de Google. Permite las ventanas emergentes.',
        'auth/popup-closed-by-user': 'Se canceló el inicio de sesión con Google.'
    };
    return messages[error.code] || error.message;
};

document.getElementById('btn-register').addEventListener('click', async () => {
    const { nickname, email, password } = getAuthFields();
    const status = document.getElementById('login-status');
    if (!nickname || !email || password.length < 6) {
        status.textContent = 'Completa nombre, correo y una contraseña de al menos 6 caracteres.';
        return;
    }
    try {
        await setRememberDevice(rememberDevice.checked);
        status.textContent = 'Creando cuenta…';
        await registrarCuenta(email, password, nickname);
    } catch (e) {
        console.error(e);
        status.textContent = showAuthError(e);
    }
});

document.getElementById('btn-login').addEventListener('click', async () => {
    const { email, password } = getAuthFields();
    const status = document.getElementById('login-status');
    if (!email || !password) {
        status.textContent = 'Introduce tu correo y contraseña.';
        return;
    }
    try {
        await setRememberDevice(rememberDevice.checked);
        status.textContent = 'Iniciando sesión…';
        await iniciarSesion(email, password);
    } catch (e) {
        console.error(e);
        status.textContent = showAuthError(e);
    }
});

document.getElementById('btn-login-google').addEventListener('click', async () => {
    const nickname = document.getElementById('input-nickname').value.trim();
    const status = document.getElementById('login-status');
    if (!nickname) {
        status.textContent = 'Escribe primero el nombre que usarás en el juego.';
        document.getElementById('input-nickname').focus();
        return;
    }
    if (!['http:', 'https:'].includes(window.location.protocol)) {
        status.textContent = 'Google solo funciona desde GitHub Pages o un servidor local (http/https), no desde file://.';
        return;
    }
    try {
        sessionStorage.setItem('pendingGoogleNickname', nickname);
        localStorage.setItem(rememberStorageKey, String(rememberDevice.checked));
        status.textContent = 'Redirigiendo a Google…';
        await loginGoogle();
    } catch (e) {
        pendingGoogleNickname = '';
        console.error(e);
        status.textContent = showAuthError(e);
    }
});

// --- NAVEGACIÓN ---
document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const target = e.currentTarget.dataset.nav;
        if (target === 'play') ui.showScreen('screen-play');
        if (target === 'shop') ui.showScreen('screen-shop');
        if (target === 'locker') ui.showScreen('screen-locker');
        if (target === 'battlepass') ui.showScreen('screen-battlepass');
    });
});

document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => {
        ui.showScreen('screen-menu');
    });
});

document.getElementById('btn-training').addEventListener('click', () => {
    game.startStory();
});

game.onProgress = async ({ xp, coins }) => {
    if (!currentUser || !currentProfile) return;
    try {
        await guardarEstadisticasPartida(currentUser.uid, xp, coins);
        await persistProfile(await obtenerPerfilUsuario(currentUser.uid, currentProfile.nombre));
    } catch (error) {
        console.error('No se pudo guardar la recompensa de campaña:', error);
    }
};

// --- SALIR DE PARTIDA ---
document.getElementById('btn-leave-match').addEventListener('click', () => {
    game.stop();
    ui.mostrarHUD(false);
    ui.showScreen('screen-menu');
});

document.getElementById('btn-exit-match').addEventListener('click', () => {
    game.stop();
    ui.mostrarHUD(false);
    ui.showScreen('screen-menu');
});

// --- AUTENTICACIÓN ---
const rememberOnStartup = localStorage.getItem(rememberStorageKey) === 'true';
try {
    await prepararAutenticacionManual(rememberOnStartup);
} catch (error) {
    console.error(error);
    document.getElementById('login-status').textContent = error.message;
}
const googleRedirectUser = await obtenerResultadoGoogle().catch(error => {
    console.error(error);
    document.getElementById('login-status').textContent = showAuthError(error);
    return null;
});
const googleRedirectPending = Boolean(sessionStorage.getItem('pendingGoogleNickname'));
if (!googleRedirectUser && !googleRedirectPending && !rememberOnStartup) {
    await cerrarSesion();
}
escucharAuth(async (user) => {
    if (user) {
        currentUser = user;
        const nickname = sessionStorage.getItem('pendingGoogleNickname')
            || pendingGoogleNickname
            || user.displayName
            || document.getElementById('input-nickname').value.trim()
            || 'Jugador';
        try {
            const perfil = await obtenerPerfilUsuario(user.uid, nickname);
            await persistProfile(perfil);
            pendingGoogleNickname = '';
            sessionStorage.removeItem('pendingGoogleNickname');
            ui.showScreen('screen-menu');
        } catch (error) {
            console.error(error);
            document.getElementById('login-status').textContent = `No se pudo cargar el perfil: ${error.message}`;
        }
    } else {
        ui.showScreen('screen-login');
    }
});

console.log('✅ NeonStrike3D cargado correctamente');

document.querySelectorAll('#locker-tabs .chip').forEach(chip => chip.addEventListener('click', e => {
    document.querySelectorAll('#locker-tabs .chip').forEach(item => item.classList.remove('active'));
    e.currentTarget.classList.add('active');
    refreshContent();
}));
refreshContent();