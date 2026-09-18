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
    reclamarRecompensa
} from './firebase.js';

const ui = new UIManager();
const game = new GameEngine(ui);
game.onLobbyChanged = players => ui.updateLobbyUI(players, isHost);
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
let selectedMode = 'ffa';
let selectedMap = 'neon-district';

const shopItems = [
    { id: 'neon-blue', nombre: 'Pulso Ártico', descripcion: 'Skin de arma azul eléctrico.', categoria: 'skin', icon: '🔷', precio: 250 },
    { id: 'neon-pink', nombre: 'Rayo Rosa', descripcion: 'Skin de arma con brillo magenta.', categoria: 'skin', icon: '💗', precio: 400 },
    { id: 'nova-burst', nombre: 'Nova Burst', descripcion: 'Efecto de eliminación explosivo.', categoria: 'killEffect', icon: '💥', precio: 350 },
    { id: 'tag-hunter', nombre: '[HUNTER]', descripcion: 'Tag para destacar en el marcador.', categoria: 'tag', icon: '🎯', precio: 200 }
];
const battlePassTiers = [
    { nivel: 1, icon: '◈', recompensa: '100 monedas', monedas: 100 },
    { nivel: 2, icon: '🔷', recompensa: 'Pulso Ártico', itemId: 'neon-blue' },
    { nivel: 3, icon: '◈', recompensa: '200 monedas', monedas: 200 },
    { nivel: 4, icon: '💥', recompensa: 'Nova Burst', itemId: 'nova-burst' },
    { nivel: 5, icon: '★', recompensa: '300 monedas', monedas: 300 }
];

const refreshContent = () => {
    if (!currentProfile) return;
    ui.renderItems('shop-grid', shopItems, null, handleShopItem);
    const category = document.querySelector('#locker-tabs .chip.active')?.dataset.cat || 'skin';
    const lockerItems = [{ id: 'default', nombre: 'Estándar', descripcion: 'Equipo inicial de NeonStrike.', categoria: category, icon: '⚡', precio: 0 }, ...shopItems];
    ui.renderItems('locker-grid', lockerItems.filter(item => item.categoria === category || item.id === 'default'), currentProfile.skinEquipada, handleLockerItem);
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
        document.getElementById('play-status').textContent = `Tienda: ${error.message}`;
    }
}

async function handleLockerItem(item) {
    if (!currentUser || !currentProfile || !(currentProfile.inventario || []).includes(item.id)) return;
    const changes = item.categoria === 'skin' ? { skinEquipada: item.id } : item.categoria === 'killEffect' ? { efectoKill: item.id } : { tagEquipado: item.id === 'default' ? '[N00B]' : '[HUNTER]' };
    try {
        await actualizarPerfil(currentUser.uid, changes);
        await persistProfile({ ...currentProfile, ...changes });
    } catch (error) {
        document.getElementById('play-status').textContent = `Taquilla: ${error.message}`;
    }
};

async function claimBattlePass(tier) {
    if (!currentUser || !currentProfile) return;
    try {
        await persistProfile(await reclamarRecompensa(currentUser.uid, tier.nivel));
    } catch (error) {
        document.getElementById('play-status').textContent = `Pase: ${error.message}`;
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

// --- LOBBY ---
let isHost = false;
let currentRoomCode = '';

document.getElementById('btn-host').addEventListener('click', () => {
    isHost = true;
    currentRoomCode = (document.getElementById('input-room-code').value.trim() || 'ns3d-' + Math.floor(Math.random() * 9000 + 1000))
        .replace(/[^a-zA-Z0-9_-]/g, '-');
    document.getElementById('lobby-panel').hidden = false;
    document.getElementById('lobby-code').textContent = currentRoomCode;
    document.getElementById('play-status').textContent = `Comparte este ID con tus amigos: ${currentRoomCode}`;
    ui.updateLobbyUI([{ name: 'Tú (Host)', isHost: true }], true);
    game.prepareHost(currentRoomCode, selectedMap);
});

document.getElementById('btn-join').addEventListener('click', () => {
    const peerId = document.getElementById('input-join-id').value.trim();
    if (!peerId) return alert('Introduce el ID de la sala del Host');
    isHost = false;
    currentRoomCode = peerId;
    document.getElementById('lobby-panel').hidden = false;
    document.getElementById('lobby-code').textContent = peerId;
    ui.updateLobbyUI([{ name: game.playerName || 'Tú', isHost: false }], false);

    game.connectToHost(peerId);
});

// Modos de juego (solo cambia visual)
document.querySelectorAll('#mode-btns .chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        document.querySelectorAll('#mode-btns .chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        selectedMode = e.currentTarget.dataset.mode;
    });
});

document.querySelectorAll('#map-btns .chip').forEach(chip => {
        chip.addEventListener('click', e => {
            document.querySelectorAll('#map-btns .chip').forEach(item => item.classList.remove('active'));
            e.currentTarget.classList.add('active');
            selectedMap = e.currentTarget.dataset.map;
        });
});

document.getElementById('btn-start').addEventListener('click', () => {
    const mode = document.querySelector('#mode-btns .chip.active')?.dataset.mode || 'ffa';
    game.startMatch(mode, true, currentRoomCode, selectedMap);
});

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
await prepararAutenticacionManual(rememberOnStartup);
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