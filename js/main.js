// js/main.js
import { UIManager } from './ui.js';
import { GameEngine } from './game.js';
import {
    loginAnonimo,
    loginGoogle,
    escucharAuth,
    obtenerPerfilUsuario
} from './firebase.js';

const ui = new UIManager();
const game = new GameEngine(ui);

// --- LOGIN ---
document.getElementById('btn-login-anon').addEventListener('click', async () => {
    const nickname = document.getElementById('input-nickname').value.trim() || 'Invocador';
    const status = document.getElementById('login-status');
    try {
        status.textContent = 'Iniciando sesión…';
        await loginAnonimo(nickname);
    } catch (e) {
        console.error(e);
        status.textContent = 'Error: ' + e.message;
    }
});

document.getElementById('btn-login-google').addEventListener('click', async () => {
    const status = document.getElementById('login-status');
    try {
        status.textContent = 'Iniciando sesión con Google…';
        await loginGoogle();
    } catch (e) {
        console.error(e);
        status.textContent = 'Error: ' + e.message;
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
    currentRoomCode = 'ns3d-' + Math.floor(Math.random() * 9000 + 1000);
    document.getElementById('lobby-panel').hidden = false;
    document.getElementById('lobby-code').textContent = currentRoomCode;
    document.getElementById('play-status').textContent = `Comparte este ID con tus amigos: ${currentRoomCode}`;
    ui.updateLobbyUI([{ name: 'Tú (Host)', isHost: true }], true);
});

document.getElementById('btn-join').addEventListener('click', () => {
    const peerId = document.getElementById('input-join-id').value.trim();
    if (!peerId) return alert('Introduce el ID de la sala del Host');
    isHost = false;
    currentRoomCode = peerId;
    document.getElementById('lobby-panel').hidden = false;
    document.getElementById('lobby-code').textContent = peerId;
    ui.updateLobbyUI([{ name: 'Tú', isHost: false }], false);

    // Arrancar partida directamente en modo cliente
    setTimeout(() => {
        game.startMatch('ffa', false, peerId);
    }, 500);
});

// Modos de juego (solo cambia visual)
document.querySelectorAll('#mode-btns .chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        document.querySelectorAll('#mode-btns .chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
    });
});

document.getElementById('btn-start').addEventListener('click', () => {
    const mode = document.querySelector('#mode-btns .chip.active')?.dataset.mode || 'ffa';
    game.startMatch(mode, true);
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
escucharAuth(async (user) => {
    if (user) {
        const nickname = document.getElementById('input-nickname').value.trim() || user.displayName || 'Invocador';
        const perfil = await obtenerPerfilUsuario(user.uid, nickname);
        ui.updatePlayerUI(perfil);
        ui.showScreen('screen-menu');
    } else {
        ui.showScreen('screen-login');
    }
});

console.log('✅ NeonStrike3D cargado correctamente');