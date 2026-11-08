// --- Variables de Estado Global ---
let serverUrl = "";
let username = "";
let password = "";
let activeTab = "live"; // live, movies, series, favorites, downloads
let activeCategoryId = "";
let categoriesData = {}; // Cache de categorías
let streamsData = [];    // Cache de streams activos para búsqueda
let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");

// Variables de Personalización Premium
let useAmoledMode = localStorage.getItem("iptv_use_amoled") === "true";
let recentChannels = JSON.parse(localStorage.getItem("iptv_recents") || "[]");
let savedAccounts = JSON.parse(localStorage.getItem("iptv_accounts") || "[]");
let downloads = JSON.parse(localStorage.getItem("iptv_downloads") || "[]");

// Variables del modo M3U
let isM3UMode = false;
let m3uData = null; // Contendrá { channels: [], categories: [] }
let currentSelectedMovie = null; // Para el modal de detalles
let useExternalPlayer = localStorage.getItem("iptv_use_external") === "true";
let useHLSFormat = localStorage.getItem("iptv_use_hls") === "true";

// Variables para control de lista y reproducción de canales
let currentPlayingList = [];
let currentPlayingIndex = -1;
let currentPlayingType = "live";

// Elementos del DOM
const loginView = document.getElementById("login-view");
const mainView = document.getElementById("main-view");

const loginForm = document.getElementById("login-form");
const loginM3uForm = document.getElementById("login-m3u-form");
const loginSpinner = document.getElementById("login-spinner");
const loginM3uSpinner = document.getElementById("login-m3u-spinner");
const loginError = document.getElementById("login-error");

const categoriesContainer = document.getElementById("categories-container");
const streamsContainer = document.getElementById("streams-container");
const searchInput = document.getElementById("search-input");
const clearSearchBtn = document.getElementById("clear-search");

const tabButtons = document.querySelectorAll(".tab-btn");
const logoutBtn = document.getElementById("logout-btn");
const accountStatus = document.getElementById("account-status");

// --- Inicialización ---
document.addEventListener("DOMContentLoaded", () => {
    // Pestañas de la pantalla de login (Xtream vs M3U)
    const loginTabButtons = document.querySelectorAll(".login-tab-btn");
    const loginTabContents = document.querySelectorAll(".login-tab-content");
    
    loginTabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            loginTabButtons.forEach(b => b.classList.remove("active"));
            loginTabContents.forEach(c => c.classList.remove("active"));
            btn.classList.add("active");
            
            const type = btn.getAttribute("data-login-type");
            if (type === "xtream") {
                loginForm.classList.add("active");
            } else {
                loginM3uForm.classList.add("active");
            }
        });
    });

    // Escuchar envío del formulario de login (Xtream)
    loginForm.addEventListener("submit", handleLogin);
    
    // Escuchar envío del formulario de login (M3U)
    if (loginM3uForm) {
        loginM3uForm.addEventListener("submit", handleM3ULoginSubmit);
    }

    // Configurar pestañas principales
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            switchTab(targetTab);
        });
    });

    // Cerrar sesión
    logoutBtn.addEventListener("click", handleLogout);

    // Configurar el switch del Modo AMOLED
    const amoledToggle = document.getElementById("amoled-toggle");
    if (amoledToggle) {
        amoledToggle.checked = useAmoledMode;
        if (useAmoledMode) document.body.classList.add("amoled-mode");
        amoledToggle.addEventListener("change", (e) => {
            useAmoledMode = e.target.checked;
            localStorage.setItem("iptv_use_amoled", useAmoledMode);
            if (useAmoledMode) {
                document.body.classList.add("amoled-mode");
                showToast("Modo AMOLED activado (Negro puro)", "success");
            } else {
                document.body.classList.remove("amoled-mode");
                showToast("Modo AMOLED desactivado", "info");
            }
        });
    }

    // Configurar el switch del reproductor externo
    const extToggle = document.getElementById("external-player-toggle");
    if (extToggle) {
        extToggle.checked = useExternalPlayer;
        extToggle.addEventListener("change", (e) => {
            useExternalPlayer = e.target.checked;
            localStorage.setItem("iptv_use_external", useExternalPlayer);
            if (useExternalPlayer) {
                showToast("Reproductor externo VLC activado", "success");
            } else {
                showToast("Reproductor interno ExoPlayer activado", "info");
            }
        });
    }

    // Configurar el switch del formato HLS
    const hlsToggle = document.getElementById("hls-format-toggle");
    if (hlsToggle) {
        hlsToggle.checked = useHLSFormat;
        hlsToggle.addEventListener("change", (e) => {
            useHLSFormat = e.target.checked;
            localStorage.setItem("iptv_use_hls", useHLSFormat);
            if (useHLSFormat) {
                showToast("Formato HLS activado (Audio compatible)", "success");
            } else {
                showToast("Formato MPEG-TS activado", "info");
            }
            
            // Si está en modo M3U y ya logueado, recargar para actualizar las URLs de los canales
            if (isM3UMode) {
                const savedM3U = localStorage.getItem("iptv_m3u_url");
                if (savedM3U) {
                    showToast("Actualizando formato de lista...", "info");
                    executeM3ULogin(savedM3U);
                }
            }
        });
    }

    // Enlazar el botón de limpiar recientes
    const clearRecentsBtn = document.getElementById("clear-recents-btn");
    if (clearRecentsBtn) {
        clearRecentsBtn.addEventListener("click", () => {
            recentChannels = [];
            localStorage.setItem("iptv_recents", JSON.stringify(recentChannels));
            renderRecentChannelsList();
            showToast("Historial de reproducción limpiado", "info");
        });
    }

    // Búsqueda
    searchInput.addEventListener("input", filterStreams);
    clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        clearSearchBtn.classList.add("hidden");
        filterStreams();
    });

    // Configurar cierres del modal de detalles de película
    document.getElementById("close-modal-btn").addEventListener("click", hideMovieModal);
    document.getElementById("movie-details-modal").addEventListener("click", (e) => {
        if (e.target.id === "movie-details-modal") hideMovieModal();
    });

    // Inicializar cuentas guardadas
    renderSavedAccounts();

    // Intentar auto-login si ya hay credenciales guardadas
    checkAutoLogin();
});


// --- Puente de Red Nativo ---
function nativeFetch(url) {
    return new Promise((resolve, reject) => {
        const callbackName = "cb_" + Math.random().toString(36).substring(2, 9);
        
        window[callbackName] = (data) => {
            delete window[callbackName];
            try {
                const parsed = JSON.parse(data);
                if (parsed.error) {
                    reject(new Error(parsed.error));
                } else {
                    resolve(parsed);
                }
            } catch (e) {
                resolve(data);
            }
        };

        if (typeof AndroidBridge !== "undefined" && AndroidBridge.fetchUrl) {
            AndroidBridge.fetchUrl(url, callbackName);
        } else {
            console.warn("AndroidBridge no encontrado. Usando fetch nativo.");
            fetch(url)
                .then(r => r.text())
                .then(text => window[callbackName](text))
                .catch(err => {
                    delete window[callbackName];
                    reject(err);
                });
        }
    });
}

// --- Sistema de Notificaciones Toast ---
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    let icon = "ℹ️";
    if (type === "error") icon = "⚠️";
    if (type === "success") icon = "✓";

    toast.innerHTML = `
        <span style="margin-right:8px; font-weight:bold;">${icon}</span>
        <span style="flex-grow:1">${message}</span>
        <button class="toast-close">&times;</button>
    `;

    container.appendChild(toast);

    // Cerrar botón click
    toast.querySelector(".toast-close").addEventListener("click", () => {
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 300);
    });

    // Auto eliminar en 4 segundos
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add("fade-out");
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// --- Autenticación ---
function checkAutoLogin() {
    const savedMode = localStorage.getItem("iptv_mode");
    if (savedMode === "m3u") {
        const savedM3U = localStorage.getItem("iptv_m3u_url") || "";
        if (savedM3U) {
            document.getElementById("m3u-url").value = savedM3U;
            executeM3ULogin(savedM3U);
        }
        return;
    }

    const savedServer = localStorage.getItem("iptv_server");
    const savedUser = localStorage.getItem("iptv_user");
    const savedPass = localStorage.getItem("iptv_pass");

    if (savedServer && savedUser && savedPass) {
        document.getElementById("server-url").value = savedServer;
        document.getElementById("username").value = savedUser;
        document.getElementById("password").value = savedPass;
        
        serverUrl = savedServer;
        username = savedUser;
        password = savedPass;
        executeLogin();
    }
}

function handleLogin(e) {
    e.preventDefault();
    serverUrl = document.getElementById("server-url").value;
    username = document.getElementById("username").value.trim();
    password = document.getElementById("password").value.trim();

    if (!serverUrl || !username || !password) {
        showLoginError("Por favor rellena todos los campos.");
        return;
    }

    executeLogin();
}

function executeLogin() {
    showLoginLoading(true);
    loginError.classList.add("hidden");

    const loginApiUrl = `${serverUrl}/player_api.php?username=${username}&password=${password}`;
    
    nativeFetch(loginApiUrl)
        .then(data => {
            showLoginLoading(false);
            
            if (data && data.user_info && data.user_info.auth !== 0 && data.user_info.status !== "Expired") {
                localStorage.setItem("iptv_mode", "xtream");
                localStorage.setItem("iptv_server", serverUrl);
                localStorage.setItem("iptv_user", username);
                localStorage.setItem("iptv_pass", password);

                isM3UMode = false;

                const status = data.user_info.status || "Active";
                accountStatus.textContent = status === "Active" ? "Activo" : status;
                
                showView(mainView);
                switchTab("live");
                saveAccount({
                    type: "xtream",
                    server: serverUrl,
                    user: username,
                    pass: password
                });
                showToast("Sesión iniciada con éxito (Xtream API)", "success");
            } else {
                showLoginError("Credenciales incorrectas o cuenta inactiva.");
                showToast("Fallo de autenticación", "error");
            }
        })
        .catch(err => {
            showLoginLoading(false);
            showLoginError("Error de conexión al servidor: " + err.message);
            showToast("Error de conexión", "error");
        });
}

// --- Autenticación Modo M3U ---
function handleM3ULoginSubmit(e) {
    e.preventDefault();
    const m3uUrl = document.getElementById("m3u-url").value.trim();
    if (!m3uUrl) {
        showLoginError("Por favor introduces una URL M3U válida.");
        return;
    }
    executeM3ULogin(m3uUrl);
}

function executeM3ULogin(m3uUrl) {
    showM3ULoading(true);
    loginError.classList.add("hidden");
    
    // Transformar la URL para pedir al servidor el formato adecuado (mpegts o hls) según el switch HLS
    let requestUrl = m3uUrl;
    if (useHLSFormat) {
        requestUrl = m3uUrl.replace("o=mpegts", "o=hls");
    } else {
        requestUrl = m3uUrl.replace("o=hls", "o=mpegts");
    }
    
    nativeFetch(requestUrl)
        .then(text => {
            showM3ULoading(false);
            if (text && text.includes("#EXTM3U")) {
                localStorage.setItem("iptv_mode", "m3u");
                localStorage.setItem("iptv_m3u_url", m3uUrl); // Guardamos la URL base limpia
                m3uData = parseM3U(text);
                isM3UMode = true;

                accountStatus.textContent = "M3U ACTIVO";
                showView(mainView);
                switchTab("live");
                saveAccount({
                    type: "m3u",
                    server: m3uUrl,
                    user: "Lista M3U",
                    pass: ""
                });
                showToast("Lista M3U cargada correctamente", "success");
            } else {
                showLoginError("La lista M3U descargada no tiene un formato válido.");
                showToast("Error de formato M3U", "error");
            }
        })
        .catch(err => {
            showM3ULoading(false);
            showLoginError("Error al descargar lista M3U: " + err.message);
            showToast("Error al cargar lista", "error");
        });
}

function showM3ULoading(show) {
    if (show) {
        if (loginM3uSpinner) loginM3uSpinner.classList.remove("hidden");
        loginM3uForm.querySelectorAll("input, textarea, button").forEach(el => el.disabled = true);
        document.querySelectorAll(".login-tab-btn").forEach(btn => btn.style.pointerEvents = "none");
    } else {
        if (loginM3uSpinner) loginM3uSpinner.classList.add("hidden");
        loginM3uForm.querySelectorAll("input, textarea, button").forEach(el => el.disabled = false);
        document.querySelectorAll(".login-tab-btn").forEach(btn => btn.style.pointerEvents = "auto");
    }
}

function showLoginLoading(show) {
    if (show) {
        loginSpinner.classList.remove("hidden");
        loginForm.querySelectorAll("input, select, button").forEach(el => el.disabled = true);
        document.querySelectorAll(".login-tab-btn").forEach(btn => btn.style.pointerEvents = "none");
    } else {
        loginSpinner.classList.add("hidden");
        loginForm.querySelectorAll("input, select, button").forEach(el => el.disabled = false);
        document.querySelectorAll(".login-tab-btn").forEach(btn => btn.style.pointerEvents = "auto");
    }
}

function handleLogout() {
    localStorage.removeItem("iptv_mode");
    localStorage.removeItem("iptv_server");
    localStorage.removeItem("iptv_user");
    localStorage.removeItem("iptv_pass");
    localStorage.removeItem("iptv_m3u_url");
    isM3UMode = false;
    m3uData = null;
    showView(loginView);
    showToast("Sesión cerrada", "info");
}

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove("hidden");
}

// --- Navegación entre Vistas ---
function showView(targetView) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    targetView.classList.add("active");
}

// --- Parseador M3U ---
function parseM3U(m3uText) {
    const lines = m3uText.split('\n');
    const channels = [];
    const categoriesSet = new Set();
    
    let currentChannel = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
            currentChannel = {};
            
            const commaIndex = line.lastIndexOf(',');
            if (commaIndex > -1) {
                currentChannel.name = line.substring(commaIndex + 1).trim();
            } else {
                currentChannel.name = "Canal sin nombre";
            }
            
            const groupMatch = line.match(/group-title="([^"]+)"/i);
            if (groupMatch) {
                currentChannel.category = groupMatch[1];
            } else {
                currentChannel.category = "Otros";
            }
            categoriesSet.add(currentChannel.category);
            
            const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
            if (logoMatch) {
                currentChannel.logo = logoMatch[1];
            } else {
                currentChannel.logo = "";
            }
        } else if (line.startsWith('http') && currentChannel) {
            currentChannel.url = line;
            channels.push(currentChannel);
            currentChannel = null;
        }
    }
    
    return {
        channels: channels,
        categories: Array.from(categoriesSet)
    };
}

// Clasificador de categorías M3U a pestañas
function getTabForCategory(catName) {
    const name = catName.toUpperCase();
    if (name.includes("SERIE")) return "series";
    if (name.includes("CINE") || name.includes("PELI") || name.includes("VOD") || name.includes("MOVIE") || name.includes("FILM")) return "movies";
    return "live";
}

// --- Manejo de Pestañas y Datos ---
function switchTab(tabName) {
    activeTab = tabName;
    activeCategoryId = "";
    streamsData = [];
    
    tabButtons.forEach(btn => {
        if (btn.getAttribute("data-tab") === tabName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    searchInput.value = "";
    clearSearchBtn.classList.add("hidden");

    // Refrescar recientes
    renderRecentChannelsList();

    if (tabName === "favorites") {
        categoriesContainer.innerHTML = `<div class="category-item active">Mis Favoritos</div>`;
        loadFavorites();
        return;
    }

    if (tabName === "downloads") {
        categoriesContainer.innerHTML = `<div class="category-item active">Descargas Locales</div>`;
        renderDownloadsList();
        return;
    }

    if (isM3UMode) {
        loadM3UCategories(tabName);
    } else {
        loadCategories(tabName);
    }
}

// Cargar Categorías Xtream
function loadCategories(type) {
    renderCategorySkeletons();
    streamsContainer.innerHTML = "";
    
    const action = `get_${type}_categories`;
    const categoriesUrl = `${serverUrl}/player_api.php?username=${username}&password=${password}&action=${action}`;

    nativeFetch(categoriesUrl)
        .then(categories => {
            if (!Array.isArray(categories)) {
                categories = [];
            }
            
            categoriesData[type] = categories;
            renderCategories(categories);
            
            if (categories.length > 0) {
                selectCategory(categories[0].category_id);
            } else {
                streamsContainer.innerHTML = `<div class="no-data">No hay categorías disponibles</div>`;
            }
        })
        .catch(err => {
            categoriesContainer.innerHTML = `<div class="error-msg">Error al cargar categorías: ${err.message}</div>`;
        });
}

function renderCategorySkeletons() {
    categoriesContainer.innerHTML = `
        <div class="skeleton-category"></div>
        <div class="skeleton-category"></div>
        <div class="skeleton-category"></div>
        <div class="skeleton-category"></div>
    `;
}

function renderCategories(categories) {
    categoriesContainer.innerHTML = "";
    categories.forEach(cat => {
        const div = document.createElement("div");
        div.className = "category-item";
        div.setAttribute("data-id", cat.category_id);
        div.textContent = cat.category_name;
        div.addEventListener("click", () => selectCategory(cat.category_id));
        categoriesContainer.appendChild(div);
    });
}

function selectCategory(catId) {
    activeCategoryId = catId;
    
    const items = categoriesContainer.querySelectorAll(".category-item");
    items.forEach(item => {
        if (item.getAttribute("data-id") === catId) {
            item.classList.add("active");
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.classList.remove("active");
        }
    });

    loadStreams();
}

// Cargar Streams Xtream
function loadStreams() {
    renderStreamSkeletons();
    
    let action = "get_live_streams";
    if (activeTab === "movies") action = "get_vod_streams";
    if (activeTab === "series") action = "get_series";

    const streamsUrl = `${serverUrl}/player_api.php?username=${username}&password=${password}&action=${action}&category_id=${activeCategoryId}`;

    nativeFetch(streamsUrl)
        .then(streams => {
            if (!Array.isArray(streams)) {
                streams = [];
            }
            streamsData = streams;
            renderStreams(streams);
        })
        .catch(err => {
            streamsContainer.innerHTML = `<div class="error-msg">Error al cargar canales: ${err.message}</div>`;
        });
}

function renderStreamSkeletons() {
    streamsContainer.innerHTML = `
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
    `;
}

function renderStreams(streams) {
    streamsContainer.innerHTML = "";
    if (streams.length === 0) {
        streamsContainer.innerHTML = `<div class="no-data" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No hay elementos en esta categoría</div>`;
        return;
    }

    streams.forEach(stream => {
        const card = document.createElement("div");
        card.className = "stream-card";
        
        const isSeries = activeTab === "series";
        const id = isSeries ? stream.series_id : stream.stream_id;
        const name = stream.name;
        const iconUrl = isSeries ? stream.cover : stream.stream_icon;

        // Añadir ID para poder referenciar y sincronizar el botón de fav desde el modal
        card.setAttribute("data-id", id);
        
        const logoContainer = document.createElement("div");
        logoContainer.className = "stream-logo-container";
        
        if (iconUrl && iconUrl.startsWith("http")) {
            const img = document.createElement("img");
            img.className = "stream-logo";
            img.src = iconUrl;
            img.loading = "lazy";
            img.onerror = () => {
                img.style.display = "none";
                logoContainer.appendChild(createFallbackLogo(name));
            };
            logoContainer.appendChild(img);
        } else {
            logoContainer.appendChild(createFallbackLogo(name));
        }

        const nameDiv = document.createElement("div");
        nameDiv.className = "stream-name";
        nameDiv.textContent = name;

        const favBtn = document.createElement("button");
        favBtn.className = "fav-btn";
        const isFav = isFavorite(id, activeTab);
        if (isFav) favBtn.classList.add("active");
        favBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        `;
        
        favBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(stream, id, activeTab, favBtn);
        });

        card.appendChild(logoContainer);
        card.appendChild(nameDiv);
        card.appendChild(favBtn);

        // Añadir EPG para directos
        if (activeTab === "live") {
            const epgContainer = document.createElement("div");
            epgContainer.className = "epg-container";
            const epgInfo = getFakeEPGProgram(id, name);
            epgContainer.innerHTML = `
                <span class="epg-program-name">${epgInfo.title}</span>
                <div class="epg-progress-bar">
                    <div class="epg-progress-fill" style="width: ${epgInfo.progress}%"></div>
                </div>
            `;
            card.appendChild(epgContainer);
        }

        // Añadir botón rápido de VLC para reproducción externa directa en directos y películas
        if (!isSeries) {
            const vlcBtn = document.createElement("button");
            vlcBtn.className = "vlc-btn";
            vlcBtn.title = "Reproducir en VLC externo";
            vlcBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2L4 20h16L12 2zm-1.5 4h3L14 9h-4l.5-3zM9 11h6l.67 2H8.33L9 11zm-2.33 7h10.66l.67 2H6L6.67 18z"/></svg>
            `;
            vlcBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                let streamUrl = "";
                if (activeTab === "live") {
                    if (useHLSFormat) {
                        streamUrl = `${serverUrl}/live/${username}/${password}/${id}.m3u8`;
                    } else {
                        streamUrl = `${serverUrl}/live/${username}/${password}/${id}.ts`;
                    }
                } else if (activeTab === "movies") {
                    const ext = stream.container_extension || "mp4";
                    streamUrl = `${serverUrl}/movie/${username}/${password}/${id}.${ext}`;
                }
                
                if (typeof AndroidBridge !== "undefined") {
                    showToast("Abriendo en reproductor externo VLC...", "success");
                    AndroidBridge.playExternal(streamUrl);
                } else {
                    showToast("Modo Web - VLC: " + name, "info");
                    console.log("Stream URL:", streamUrl);
                }
            });
            card.appendChild(vlcBtn);
        }

        card.addEventListener("click", () => {
            if (activeTab === "series") {
                openSeriesDetails(stream);
            } else if (activeTab === "movies") {
                openMovieDetails(stream);
            } else {
                playStream(stream, activeTab);
            }
        });

        streamsContainer.appendChild(card);
    });
}

// --- Manejo M3U en Dashboard ---
function loadM3UCategories(type) {
    renderCategorySkeletons();
    streamsContainer.innerHTML = "";

    const filteredCats = m3uData.categories.filter(cat => getTabForCategory(cat) === type);
    filteredCats.sort();

    categoriesContainer.innerHTML = "";
    if (filteredCats.length === 0) {
        categoriesContainer.innerHTML = `<div class="category-item active">Sin categorías</div>`;
        streamsContainer.innerHTML = `<div class="no-data">No hay contenido disponible</div>`;
        return;
    }

    filteredCats.forEach(catName => {
        const div = document.createElement("div");
        div.className = "category-item";
        div.textContent = catName;
        div.addEventListener("click", () => selectM3UCategory(catName));
        categoriesContainer.appendChild(div);
    });

    selectM3UCategory(filteredCats[0]);
}

function selectM3UCategory(catName) {
    activeCategoryId = catName;

    const items = categoriesContainer.querySelectorAll(".category-item");
    items.forEach(item => {
        if (item.textContent === catName) {
            item.classList.add("active");
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            item.classList.remove("active");
        }
    });

    const filteredChannels = m3uData.channels.filter(ch => ch.category === catName);
    streamsData = filteredChannels;
    renderM3UStreams(filteredChannels);
}

function renderM3UStreams(channels) {
    streamsContainer.innerHTML = "";
    if (channels.length === 0) {
        streamsContainer.innerHTML = `<div class="no-data" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No hay elementos en esta categoría</div>`;
        return;
    }

    channels.forEach(ch => {
        const card = document.createElement("div");
        card.className = "stream-card";

        const logoContainer = document.createElement("div");
        logoContainer.className = "stream-logo-container";

        if (ch.logo && ch.logo.startsWith("http")) {
            const img = document.createElement("img");
            img.className = "stream-logo";
            img.src = ch.logo;
            img.loading = "lazy";
            img.onerror = () => {
                img.style.display = "none";
                logoContainer.appendChild(createFallbackLogo(ch.name));
            };
            logoContainer.appendChild(img);
        } else {
            logoContainer.appendChild(createFallbackLogo(ch.name));
        }

        const nameDiv = document.createElement("div");
        nameDiv.className = "stream-name";
        nameDiv.textContent = ch.name;

        const favBtn = document.createElement("button");
        favBtn.className = "fav-btn";
        const isFav = isFavorite(ch.url, activeTab);
        if (isFav) favBtn.classList.add("active");
        favBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        `;

        favBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite({
                name: ch.name,
                stream_icon: ch.logo,
                container_extension: "ts"
            }, ch.url, activeTab, favBtn);
        });

        card.appendChild(logoContainer);
        card.appendChild(nameDiv);
        card.appendChild(favBtn);

        // Añadir EPG para directos en M3U
        if (activeTab === "live") {
            const epgContainer = document.createElement("div");
            epgContainer.className = "epg-container";
            const epgInfo = getFakeEPGProgram(ch.url, ch.name);
            epgContainer.innerHTML = `
                <span class="epg-program-name">${epgInfo.title}</span>
                <div class="epg-progress-bar">
                    <div class="epg-progress-fill" style="width: ${epgInfo.progress}%"></div>
                </div>
            `;
            card.appendChild(epgContainer);
        }

        // Añadir botón rápido de VLC para reproducción externa directa en M3U
        const vlcBtn = document.createElement("button");
        vlcBtn.className = "vlc-btn";
        vlcBtn.title = "Reproducir en VLC externo";
        vlcBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2L4 20h16L12 2zm-1.5 4h3L14 9h-4l.5-3zM9 11h6l.67 2H8.33L9 11zm-2.33 7h10.66l.67 2H6L6.67 18z"/></svg>
        `;
        vlcBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (typeof AndroidBridge !== "undefined") {
                showToast("Abriendo en reproductor externo VLC...", "success");
                AndroidBridge.playExternal(ch.url);
            } else {
                showToast("Modo Web - VLC: " + ch.name, "info");
                console.log("M3U Stream URL:", ch.url);
            }
        });
        card.appendChild(vlcBtn);

        card.addEventListener("click", () => {
            playM3UStream(ch);
        });

        streamsContainer.appendChild(card);
    });
}

function playM3UStream(ch, forcedIndex) {
    // Añadir a recientes
    addChannelToRecents({
        name: ch.name,
        logo: ch.logo,
        url: ch.url
    }, "live");

    currentPlayingType = "live";
    if (forcedIndex !== undefined) {
        currentPlayingIndex = forcedIndex;
    } else if (Array.isArray(streamsData) && streamsData.length > 0) {
        currentPlayingList = streamsData;
        const found = streamsData.findIndex(s => s.url === ch.url || s.name === ch.name);
        currentPlayingIndex = found >= 0 ? found : 0;
    } else {
        currentPlayingList = [ch];
        currentPlayingIndex = 0;
    }

    let subtitle = "";
    if (currentPlayingList.length > 0 && currentPlayingIndex >= 0) {
        subtitle = `Canal ${currentPlayingIndex + 1} de ${currentPlayingList.length}`;
    }
    if (ch.category) {
        subtitle += (subtitle ? " • " : "") + ch.category;
    }

    if (typeof AndroidBridge !== "undefined") {
        if (useExternalPlayer) {
            showToast("Abriendo en reproductor externo VLC...", "success");
            AndroidBridge.playExternal(ch.url);
        } else {
            showToast("Cargando reproductor nativo...", "info");
            if (AndroidBridge.playNativeStreamFull) {
                AndroidBridge.playNativeStreamFull(ch.url, ch.name, subtitle);
            } else {
                AndroidBridge.playNativeStream(ch.url, ch.name);
            }
        }
    } else {
        showToast("Modo Web - Reproduciendo: " + ch.name, "info");
        console.log("M3U Stream URL:", ch.url);
    }
}

function createFallbackLogo(name) {
    const div = document.createElement("div");
    div.className = "stream-logo-fallback";
    div.textContent = name ? name.substring(0, 2).toUpperCase() : "TV";
    return div;
}

// --- Búsqueda / Filtrado ---
function filterStreams() {
    const query = searchInput.value.toLowerCase().trim();
    if (query) {
        clearSearchBtn.classList.remove("hidden");
    } else {
        clearSearchBtn.classList.add("hidden");
    }

    if (activeTab === "favorites") {
        const filtered = favorites.filter(f => f.name.toLowerCase().includes(query));
        renderFavoritesList(filtered);
        return;
    }

    const filtered = streamsData.filter(s => s.name.toLowerCase().includes(query));
    if (isM3UMode) {
        renderM3UStreams(filtered);
    } else {
        renderStreams(filtered);
    }
}

// --- Gestión de Favoritos ---
function isFavorite(id, type) {
    return favorites.some(fav => fav.id === id && fav.type === type);
}

function toggleFavorite(stream, id, type, buttonEl) {
    const index = favorites.findIndex(fav => fav.id === id && fav.type === type);
    
    if (index > -1) {
        favorites.splice(index, 1);
        buttonEl.classList.remove("active");
        buttonEl.querySelector("svg").setAttribute("fill", "none");
    } else {
        const favItem = {
            id: id,
            type: type,
            name: stream.name,
            icon: type === "series" ? stream.cover : stream.stream_icon,
            extension: stream.container_extension || "ts",
            stream_id: stream.stream_id,
            series_id: stream.series_id
        };
        favorites.push(favItem);
        buttonEl.classList.add("active");
        buttonEl.querySelector("svg").setAttribute("fill", "currentColor");
    }
    
    localStorage.setItem("favorites", JSON.stringify(favorites));

    if (activeTab === "favorites") {
        loadFavorites();
    }
}

function loadFavorites() {
    renderFavoritesList(favorites);
}

function renderFavoritesList(favList) {
    streamsContainer.innerHTML = "";
    if (favList.length === 0) {
        streamsContainer.innerHTML = `<div class="no-data" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No tienes favoritos guardados</div>`;
        return;
    }

    const mapped = favList.map(fav => ({
        name: fav.name,
        stream_id: fav.stream_id || fav.id,
        series_id: fav.series_id || fav.id,
        stream_icon: fav.icon,
        cover: fav.icon,
        container_extension: fav.extension,
        isFavTabItem: true,
        favType: fav.type
    }));

    mapped.forEach(stream => {
        const card = document.createElement("div");
        card.className = "stream-card";
        const id = stream.favType === "series" ? stream.series_id : stream.stream_id;
        const name = stream.name;
        
        const logoContainer = document.createElement("div");
        logoContainer.className = "stream-logo-container";
        
        if (stream.stream_icon && stream.stream_icon.startsWith("http")) {
            const img = document.createElement("img");
            img.className = "stream-logo";
            img.src = stream.stream_icon;
            img.loading = "lazy";
            img.onerror = () => {
                img.style.display = "none";
                logoContainer.appendChild(createFallbackLogo(name));
            };
            logoContainer.appendChild(img);
        } else {
            logoContainer.appendChild(createFallbackLogo(name));
        }

        const nameDiv = document.createElement("div");
        nameDiv.className = "stream-name";
        nameDiv.textContent = name;

        const favBtn = document.createElement("button");
        favBtn.className = "fav-btn active";
        favBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        `;
        
        favBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleFavorite(stream, id, stream.favType, favBtn);
        });

        card.appendChild(logoContainer);
        card.appendChild(nameDiv);
        card.appendChild(favBtn);

        // Añadir botón rápido de VLC para favoritos de directo o película
        if (stream.favType !== "series") {
            const vlcBtn = document.createElement("button");
            vlcBtn.className = "vlc-btn";
            vlcBtn.title = "Reproducir en VLC externo";
            vlcBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2L4 20h16L12 2zm-1.5 4h3L14 9h-4l.5-3zM9 11h6l.67 2H8.33L9 11zm-2.33 7h10.66l.67 2H6L6.67 18z"/></svg>
            `;
            vlcBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                let streamUrl = "";
                if (isM3UMode) {
                    streamUrl = id;
                } else {
                    if (stream.favType === "live") {
                        if (useHLSFormat) {
                            streamUrl = `${serverUrl}/live/${username}/${password}/${id}.m3u8`;
                        } else {
                            streamUrl = `${serverUrl}/live/${username}/${password}/${id}.ts`;
                        }
                    } else if (stream.favType === "movies") {
                        const ext = stream.container_extension || "ts";
                        streamUrl = `${serverUrl}/movie/${username}/${password}/${id}.${ext}`;
                    }
                }
                
                if (typeof AndroidBridge !== "undefined") {
                    showToast("Abriendo en reproductor externo VLC...", "success");
                    AndroidBridge.playExternal(streamUrl);
                } else {
                    showToast("Modo Web - VLC: " + name, "info");
                    console.log("Stream URL:", streamUrl);
                }
            });
            card.appendChild(vlcBtn);
        }

        card.addEventListener("click", () => {
            if (stream.favType === "series" && !isM3UMode) {
                openSeriesDetails({
                    name: stream.name,
                    series_id: stream.series_id,
                    cover: stream.stream_icon
                });
            } else {
                if (isM3UMode) {
                    playM3UStream({
                        name: stream.name,
                        logo: stream.stream_icon,
                        url: id,
                        category: ""
                    });
                } else {
                    playStream(stream, stream.favType);
                }
            }
        });

        streamsContainer.appendChild(card);
    });
}

// --- Detalle de Series Xtream (Episodios) ---
function openSeriesDetails(series) {
    streamsContainer.innerHTML = "";
    categoriesContainer.innerHTML = `<div class="category-item active" id="back-to-series-btn">&larr; Volver</div>`;
    
    document.getElementById("back-to-series-btn").addEventListener("click", () => {
        switchTab("series");
    });

    renderStreamSkeletons();

    const infoUrl = `${serverUrl}/player_api.php?username=${username}&password=${password}&action=get_series_info&series_id=${series.series_id}`;
    
    nativeFetch(infoUrl)
        .then(data => {
            streamsContainer.innerHTML = "";
            
            if (!data || !data.episodes) {
                streamsContainer.innerHTML = `<div class="no-data">No se encontraron episodios</div>`;
                return;
            }

            const seasons = Object.keys(data.episodes);
            if (seasons.length === 0) {
                streamsContainer.innerHTML = `<div class="no-data">No hay temporadas</div>`;
                return;
            }

            const seasonSelectWrapper = document.createElement("div");
            seasonSelectWrapper.style.gridColumn = "1/-1";
            seasonSelectWrapper.style.marginBottom = "10px";
            seasonSelectWrapper.className = "glass-panel";
            seasonSelectWrapper.style.padding = "10px";
            seasonSelectWrapper.style.borderRadius = "var(--border-radius-md)";
            
            const label = document.createElement("label");
            label.textContent = "Temporada: ";
            label.style.fontWeight = "600";
            label.style.marginRight = "10px";

            const select = document.createElement("select");
            select.style.background = "rgba(0,0,0,0.4)";
            select.style.color = "white";
            select.style.border = "1px solid var(--border-glass)";
            select.style.padding = "6px 12px";
            select.style.borderRadius = "var(--border-radius-sm)";
            
            seasons.forEach(sNum => {
                const opt = document.createElement("option");
                opt.value = sNum;
                opt.textContent = `Temporada ${sNum}`;
                select.appendChild(opt);
            });

            seasonSelectWrapper.appendChild(label);
            seasonSelectWrapper.appendChild(select);
            streamsContainer.appendChild(seasonSelectWrapper);

            const episodesContainer = document.createElement("div");
            episodesContainer.style.gridColumn = "1/-1";
            episodesContainer.style.display = "flex";
            episodesContainer.style.flexDirection = "column";
            episodesContainer.style.gap = "8px";
            streamsContainer.appendChild(episodesContainer);

            const renderEpisodesForSeason = (seasonNum) => {
                episodesContainer.innerHTML = "";
                const eps = data.episodes[seasonNum] || [];
                
                if (eps.length === 0) {
                    episodesContainer.innerHTML = `<div class="no-data">No hay episodios</div>`;
                    return;
                }

                eps.forEach(ep => {
                    const epRow = document.createElement("div");
                    epRow.className = "glass-panel";
                    epRow.style.padding = "14px";
                    epRow.style.borderRadius = "var(--border-radius-md)";
                    epRow.style.display = "flex";
                    epRow.style.justifyContent = "space-between";
                    epRow.style.alignItems = "center";
                    epRow.style.cursor = "pointer";
                    epRow.style.transition = "transform 0.2s";

                    epRow.addEventListener("click", () => {
                        const ext = ep.container_extension || "mp4";
                        const streamUrl = `${serverUrl}/series/${username}/${password}/${ep.id}.${ext}`;
                        const title = `${series.name} - E${ep.episode_num}: ${ep.title}`;
                        
                        // Añadir a recientes
                        addChannelToRecents({
                            name: title,
                            cover: series.cover,
                            series_id: series.series_id,
                            stream_id: null,
                            container_extension: ext,
                            url: ""
                        }, "series");
                        
                        if (typeof AndroidBridge !== "undefined") {
                            if (AndroidBridge.playNativeStreamFull) {
                                AndroidBridge.playNativeStreamFull(streamUrl, title, series.name);
                            } else {
                                AndroidBridge.playNativeStream(streamUrl, title);
                            }
                        } else {
                            alert("Reproduciendo episodio: " + title);
                        }
                    });

                    const titleInfo = document.createElement("div");
                    titleInfo.innerHTML = `<strong style="color:var(--secondary)">Ep. ${ep.episode_num}</strong> - ${ep.title}`;
                    
                    const actionsContainer = document.createElement("div");
                    actionsContainer.style.display = "flex";
                    actionsContainer.style.alignItems = "center";
                    actionsContainer.style.gap = "10px";

                    const vlcBtn = document.createElement("button");
                    vlcBtn.className = "vlc-episode-btn";
                    vlcBtn.title = "Reproducir en VLC externo";
                    vlcBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2L4 20h16L12 2zm-1.5 4h3L14 9h-4l.5-3zM9 11h6l.67 2H8.33L9 11zm-2.33 7h10.66l.67 2H6L6.67 18z"/></svg>
                    `;
                    vlcBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const ext = ep.container_extension || "mp4";
                        const streamUrl = `${serverUrl}/series/${username}/${password}/${ep.id}.${ext}`;
                        const title = `${series.name} - E${ep.episode_num}: ${ep.title}`;
                        
                        // Añadir a recientes
                        addChannelToRecents({
                            name: title,
                            cover: series.cover,
                            series_id: series.series_id,
                            stream_id: null,
                            container_extension: ext,
                            url: ""
                        }, "series");

                        if (typeof AndroidBridge !== "undefined") {
                            showToast("Abriendo episodio en VLC externo...", "success");
                            AndroidBridge.playExternal(streamUrl);
                        } else {
                            showToast("Modo Web - VLC Episodio: " + ep.title, "info");
                        }
                    });

                    const playBtn = document.createElement("div");
                    playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="var(--secondary)"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;

                    actionsContainer.appendChild(vlcBtn);
                    actionsContainer.appendChild(playBtn);

                    epRow.appendChild(titleInfo);
                    epRow.appendChild(actionsContainer);
                    episodesContainer.appendChild(epRow);
                });
            };

            select.addEventListener("change", (e) => {
                renderEpisodesForSeason(e.target.value);
            });

            renderEpisodesForSeason(seasons[0]);
        })
        .catch(err => {
            streamsContainer.innerHTML = `<div class="error-msg">Error al cargar detalles de la serie: ${err.message}</div>`;
        });
}

// --- Reproducción de Video Xtream ---
function playStream(stream, type, forcedIndex) {
    // Añadir a recientes
    addChannelToRecents(stream, type);

    const id = stream.stream_id;
    const ext = stream.container_extension || "ts";
    let streamUrl = "";

    if (type === "live") {
        if (useHLSFormat) {
            streamUrl = `${serverUrl}/live/${username}/${password}/${id}.m3u8`;
        } else {
            streamUrl = `${serverUrl}/live/${username}/${password}/${id}.ts`;
        }
    } else if (type === "movies") {
        streamUrl = `${serverUrl}/movie/${username}/${password}/${id}.${ext}`;
    }

    currentPlayingType = type;
    if (forcedIndex !== undefined) {
        currentPlayingIndex = forcedIndex;
    } else if (Array.isArray(streamsData) && streamsData.length > 0) {
        currentPlayingList = streamsData;
        const found = streamsData.findIndex(s => (s.stream_id && s.stream_id === id) || s.name === stream.name);
        currentPlayingIndex = found >= 0 ? found : 0;
    } else {
        currentPlayingList = [stream];
        currentPlayingIndex = 0;
    }

    let subtitle = "";
    if (currentPlayingList.length > 0 && currentPlayingIndex >= 0) {
        subtitle = `Canal ${currentPlayingIndex + 1} de ${currentPlayingList.length}`;
    }
    if (activeCategoryId && categoriesData[activeTab]) {
        const cat = categoriesData[activeTab].find(c => c.category_id == activeCategoryId);
        if (cat) {
            subtitle += (subtitle ? " • " : "") + cat.category_name;
        }
    }

    if (typeof AndroidBridge !== "undefined") {
        if (useExternalPlayer) {
            showToast("Abriendo en reproductor externo VLC...", "success");
            AndroidBridge.playExternal(streamUrl);
        } else {
            showToast("Cargando reproductor nativo...", "info");
            if (AndroidBridge.playNativeStreamFull) {
                AndroidBridge.playNativeStreamFull(streamUrl, stream.name, subtitle);
            } else {
                AndroidBridge.playNativeStream(streamUrl, stream.name);
            }
        }
    } else {
        showToast("Reproduciendo en modo web: " + stream.name, "info");
        console.log("Stream URL:", streamUrl);
    }
}

// --- Métodos globales para control desde el menú del reproductor nativo Android ---
window.playNextStream = function() {
    if (!currentPlayingList || currentPlayingList.length === 0) return;
    currentPlayingIndex = (currentPlayingIndex + 1) % currentPlayingList.length;
    const nextItem = currentPlayingList[currentPlayingIndex];
    if (isM3UMode) {
        playM3UStream(nextItem, currentPlayingIndex);
    } else {
        playStream(nextItem, currentPlayingType || activeTab, currentPlayingIndex);
    }
};

window.playPreviousStream = function() {
    if (!currentPlayingList || currentPlayingList.length === 0) return;
    currentPlayingIndex = (currentPlayingIndex - 1 + currentPlayingList.length) % currentPlayingList.length;
    const prevItem = currentPlayingList[currentPlayingIndex];
    if (isM3UMode) {
        playM3UStream(prevItem, currentPlayingIndex);
    } else {
        playStream(prevItem, currentPlayingType || activeTab, currentPlayingIndex);
    }
};

window.handleAppBack = function() {
    // 1. Si el modal de detalles de película está abierto, cerrarlo
    const movieModal = document.getElementById("movie-details-modal");
    if (movieModal && !movieModal.classList.contains("hidden")) {
        hideMovieModal();
        return true;
    }
    // 2. Si el buscador tiene texto, limpiarlo
    if (searchInput && searchInput.value.trim().length > 0) {
        searchInput.value = "";
        clearSearchBtn.classList.add("hidden");
        filterStreams();
        return true;
    }
    // 3. Si estamos en detalles de serie (botón volver a series visible)
    const backToSeriesBtn = document.getElementById("back-to-series-btn");
    if (backToSeriesBtn) {
        backToSeriesBtn.click();
        return true;
    }
    return false;
};

window.onPlayerClosed = function() {
    console.log("Reproductor nativo cerrado, en la lista de canales.");
};

// --- Callback de Error de Reproducción Nativa (Llamado desde Kotlin) ---
function onPlaybackError(errorMsg) {
    console.error("Fallo de reproducción en ExoPlayer:", errorMsg);
    // Mostrar Toast de error amigable en español
    showToast("Error de reproducción: " + errorMsg, "error");
}

// --- Detalles de Película (Modal Netflix-Style) ---
function openMovieDetails(stream) {
    currentSelectedMovie = stream;
    const movieId = stream.stream_id;
    
    // Configurar campos básicos mientras carga la API
    document.getElementById("modal-movie-title").textContent = stream.name;
    document.getElementById("modal-movie-poster").src = stream.stream_icon || "";
    document.getElementById("modal-movie-year").textContent = "...";
    document.getElementById("modal-movie-duration").textContent = "...";
    document.getElementById("modal-movie-rating").textContent = "...";
    document.getElementById("modal-movie-genre").textContent = "";
    document.getElementById("modal-movie-description").textContent = "Cargando detalles de la película...";
    document.getElementById("modal-movie-director").textContent = "...";
    document.getElementById("modal-movie-actors").textContent = "...";
    
    // Actualizar estado del botón fav en el modal
    updateModalFavButtonState(isFavorite(movieId, "movies"));

    // Mostrar el modal overlay
    const modal = document.getElementById("movie-details-modal");
    modal.classList.remove("hidden");

    // Consultar detalles de VOD a la API de Xtream Codes
    const infoUrl = `${serverUrl}/player_api.php?username=${username}&password=${password}&action=get_vod_info&vod_id=${movieId}`;
    
    nativeFetch(infoUrl)
        .then(data => {
            if (data && data.info) {
                const info = data.info;
                document.getElementById("modal-movie-poster").src = info.movie_image || info.cover_big || stream.stream_icon || "";
                document.getElementById("modal-movie-year").textContent = info.releasedate || "N/A";
                document.getElementById("modal-movie-duration").textContent = info.episode_run_time ? `${info.episode_run_time} min` : "N/A";
                document.getElementById("modal-movie-rating").textContent = info.rating ? `⭐ ${info.rating}` : "N/A";
                document.getElementById("modal-movie-genre").textContent = info.genre || "N/A";
                document.getElementById("modal-movie-description").textContent = info.description || info.plot || "Sin sinopsis disponible.";
                document.getElementById("modal-movie-director").textContent = info.director || "Desconocido";
                document.getElementById("modal-movie-actors").textContent = info.actors || info.cast || "Desconocido";
            } else {
                document.getElementById("modal-movie-description").textContent = "No se pudo recuperar la información detallada de la película.";
            }
        })
        .catch(err => {
            console.error("Error al consultar detalles de película:", err);
            document.getElementById("modal-movie-description").textContent = "Error de red al consultar detalles de la película.";
        });

    // Clonar botones para limpiar Event Listeners viejos
    const playBtn = document.getElementById("modal-play-btn");
    const newPlayBtn = playBtn.cloneNode(true);
    playBtn.parentNode.replaceChild(newPlayBtn, playBtn);
    
    newPlayBtn.addEventListener("click", () => {
        hideMovieModal();
        playStream(stream, "movies");
    });

    // Clonar y enlazar botón de reproducir en VLC directamente en el modal
    const playExtBtn = document.getElementById("modal-play-ext-btn");
    const newPlayExtBtn = playExtBtn.cloneNode(true);
    playExtBtn.parentNode.replaceChild(newPlayExtBtn, playExtBtn);
    
    newPlayExtBtn.addEventListener("click", () => {
        hideMovieModal();
        const ext = stream.container_extension || "ts";
        const streamUrl = `${serverUrl}/movie/${username}/${password}/${movieId}.${ext}`;
        if (typeof AndroidBridge !== "undefined") {
            showToast("Abriendo en reproductor externo VLC...", "success");
            AndroidBridge.playExternal(streamUrl);
        } else {
            showToast("Modo Web - Reproduciendo en VLC: " + stream.name, "info");
        }
    });

    const dlBtn = document.getElementById("modal-download-btn");
    const newDlBtn = dlBtn.cloneNode(true);
    dlBtn.parentNode.replaceChild(newDlBtn, dlBtn);
    
    newDlBtn.addEventListener("click", () => {
        hideMovieModal();
        const ext = stream.container_extension || "mp4";
        const streamUrl = `${serverUrl}/movie/${username}/${password}/${movieId}.${ext}`;
        const fileName = `${stream.name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;
        
        registerDownload(movieId, stream.name, fileName, stream.stream_icon);
        
        if (typeof AndroidBridge !== "undefined" && AndroidBridge.downloadFile) {
            AndroidBridge.downloadFile(streamUrl, fileName);
        } else {
            showToast("Modo Web - Descarga iniciada: " + fileName, "success");
        }
    });

    const favBtn = document.getElementById("modal-fav-btn");
    const newFavBtn = favBtn.cloneNode(true);
    favBtn.parentNode.replaceChild(newFavBtn, favBtn);
    
    newFavBtn.addEventListener("click", () => {
        // Ejecutar toggle de favoritos
        toggleFavorite(stream, movieId, "movies", newFavBtn);
        
        // Sincronizar el estado del botón favorito en la tarjeta del grid si es visible
        const cardFavBtn = document.querySelector(`.stream-card[data-id="${movieId}"] .fav-btn`);
        if (cardFavBtn) {
            const isNowFav = isFavorite(movieId, "movies");
            if (isNowFav) {
                cardFavBtn.classList.add("active");
                cardFavBtn.querySelector("svg").setAttribute("fill", "currentColor");
            } else {
                cardFavBtn.classList.remove("active");
                cardFavBtn.querySelector("svg").setAttribute("fill", "none");
            }
        }
        
        // Actualizar visualización en el botón del modal
        updateModalFavButtonState(isFavorite(movieId, "movies"));
    });
}

function updateModalFavButtonState(isFav) {
    const favBtn = document.getElementById("modal-fav-btn");
    if (isFav) {
        favBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="#ffd700" stroke="#ffd700" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span>Favorito</span>
        `;
        favBtn.style.color = "#ffd700";
    } else {
        favBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span>Añadir a Favoritos</span>
        `;
        favBtn.style.color = "white";
    }
}

function hideMovieModal() {
    const modal = document.getElementById("movie-details-modal");
    if (modal) modal.classList.add("hidden");
    currentSelectedMovie = null;
}

// --- 1. Guía de Programación (EPG) Dinámica Consistente ---
function getFakeEPGProgram(id, name) {
    let hash = 0;
    const seedStr = (name || id || "Canal").toString();
    for (let i = 0; i < seedStr.length; i++) {
        hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const programs = [
        "Telediario Informativo", "Cine de Acción", "Fútbol en Directo", 
        "Documental de Naturaleza", "Comedia en Familia", "Carrera de Fórmula 1", 
        "Magazine de Actualidad", "Dibujos Animados", "Deportes de Contacto", 
        "Película de Suspense", "Show de Talentos", "Música Pop Non-Stop"
    ];
    
    const progIndex = Math.abs(hash) % programs.length;
    const title = programs[progIndex];
    
    const minutes = new Date().getMinutes();
    const duration = (Math.abs(hash) % 2 === 0) ? 30 : 60;
    const currentMinuteOfHour = minutes % duration;
    const progress = Math.round((currentMinuteOfHour / duration) * 100);
    
    return {
        title: title,
        progress: progress
    };
}

// --- 2. Historial de Canales Recientes ---
function addChannelToRecents(item, type) {
    const isM3U = isM3UMode;
    const channelId = type === "series" ? item.series_id : item.stream_id;
    const id = isM3U ? item.url : channelId;
    
    if (!id) return;

    const recentItem = {
        id: id,
        name: item.name || item.title,
        logo: item.stream_icon || item.logo || item.cover || "",
        type: type,
        extension: item.container_extension || "ts",
        series_id: item.series_id || null,
        stream_id: item.stream_id || null,
        url: item.url || "",
        isM3U: isM3U
    };
    
    recentChannels = recentChannels.filter(c => c.id !== recentItem.id);
    recentChannels.unshift(recentItem);
    if (recentChannels.length > 10) recentChannels.pop();
    
    localStorage.setItem("iptv_recents", JSON.stringify(recentChannels));
    renderRecentChannelsList();
}

function renderRecentChannelsList() {
    const container = document.getElementById("recent-container");
    const list = document.getElementById("recent-channels-list");
    if (!list || !container) return;
    
    const filtered = recentChannels.filter(c => c.isM3U === isM3UMode);
    
    if (filtered.length === 0 || (activeTab !== "live" && activeTab !== "movies")) {
        container.classList.add("hidden");
        return;
    }
    
    container.classList.remove("hidden");
    list.innerHTML = "";
    
    filtered.forEach(item => {
        const card = document.createElement("div");
        card.className = "recent-card";
        
        const logoContainer = document.createElement("div");
        logoContainer.className = "recent-logo-container";
        
        if (item.logo && item.logo.startsWith("http")) {
            const img = document.createElement("img");
            img.className = "recent-logo";
            img.src = item.logo;
            img.loading = "lazy";
            img.onerror = () => {
                img.style.display = "none";
                logoContainer.appendChild(createFallbackLogo(item.name));
            };
            logoContainer.appendChild(img);
        } else {
            logoContainer.appendChild(createFallbackLogo(item.name));
        }
        
        const nameDiv = document.createElement("div");
        nameDiv.className = "recent-name";
        nameDiv.textContent = item.name;
        
        card.appendChild(logoContainer);
        card.appendChild(nameDiv);
        
        card.addEventListener("click", () => {
            if (item.isM3U) {
                playM3UStream({
                    name: item.name,
                    logo: item.logo,
                    url: item.url
                });
            } else {
                if (item.type === "series") {
                    openSeriesDetails({
                        name: item.name,
                        series_id: item.series_id,
                        cover: item.logo
                    });
                } else {
                    playStream({
                        stream_id: item.stream_id,
                        name: item.name,
                        container_extension: item.extension,
                        stream_icon: item.logo
                    }, item.type);
                }
            }
        });
        
        list.appendChild(card);
    });
}

// --- 3. Gestor de Múltiples Cuentas (Login) ---
function saveAccount(acc) {
    const exists = savedAccounts.some(a => a.server === acc.server && a.user === acc.user);
    if (!exists) {
        savedAccounts.push(acc);
        localStorage.setItem("iptv_accounts", JSON.stringify(savedAccounts));
        renderSavedAccounts();
    }
}

function renderSavedAccounts() {
    const section = document.getElementById("saved-accounts-section");
    const list = document.getElementById("saved-accounts-list");
    if (!list || !section) return;
    
    if (savedAccounts.length === 0) {
        section.classList.add("hidden");
        return;
    }
    
    section.classList.remove("hidden");
    list.innerHTML = "";
    
    savedAccounts.forEach((acc, index) => {
        const item = document.createElement("div");
        item.className = "account-item";
        
        const info = document.createElement("div");
        info.className = "account-info";
        info.innerHTML = `
            <span class="account-user">${acc.user}</span>
            <span class="account-server">${acc.server}</span>
        `;
        
        item.appendChild(info);
        
        const delBtn = document.createElement("button");
        delBtn.className = "btn-delete-account";
        delBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        `;
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            savedAccounts.splice(index, 1);
            localStorage.setItem("iptv_accounts", JSON.stringify(savedAccounts));
            renderSavedAccounts();
            showToast("Cuenta eliminada", "info");
        });
        item.appendChild(delBtn);
        
        item.addEventListener("click", () => {
            showToast("Conectando a cuenta...", "info");
            if (acc.type === "xtream") {
                document.getElementById("server-url").value = acc.server;
                document.getElementById("username").value = acc.user;
                document.getElementById("password").value = acc.pass;
                serverUrl = acc.server;
                username = acc.user;
                password = acc.pass;
                executeLogin();
            } else {
                document.getElementById("m3u-url").value = acc.server;
                executeM3ULogin(acc.server);
            }
        });
        
        list.appendChild(item);
    });
}

// --- 4. Descarga de Contenido Offline ---
function registerDownload(id, name, fileName, logo) {
    const exists = downloads.some(d => d.id === id);
    if (!exists) {
        downloads.push({
            id: id,
            name: name,
            fileName: fileName,
            logo: logo,
            date: new Date().toLocaleDateString()
        });
        localStorage.setItem("iptv_downloads", JSON.stringify(downloads));
    }
}

function renderDownloadsList() {
    streamsContainer.innerHTML = "";
    if (downloads.length === 0) {
        streamsContainer.innerHTML = `<div class="no-data" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">No tienes descargas realizadas</div>`;
        return;
    }
    
    downloads.forEach((item, index) => {
        const card = document.createElement("div");
        card.className = "stream-card";
        
        const logoContainer = document.createElement("div");
        logoContainer.className = "stream-logo-container";
        
        if (item.logo && item.logo.startsWith("http")) {
            const img = document.createElement("img");
            img.className = "stream-logo";
            img.src = item.logo;
            img.loading = "lazy";
            img.onerror = () => {
                img.style.display = "none";
                logoContainer.appendChild(createFallbackLogo(item.name));
            };
            logoContainer.appendChild(img);
        } else {
            logoContainer.appendChild(createFallbackLogo(item.name));
        }
        
        const nameDiv = document.createElement("div");
        nameDiv.className = "stream-name";
        nameDiv.textContent = item.name;
        
        const delBtn = document.createElement("button");
        delBtn.className = "fav-btn";
        delBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        `;
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            downloads.splice(index, 1);
            localStorage.setItem("iptv_downloads", JSON.stringify(downloads));
            renderDownloadsList();
            showToast("Descarga eliminada", "info");
        });
        
        card.appendChild(logoContainer);
        card.appendChild(nameDiv);
        card.appendChild(delBtn);
        
        card.addEventListener("click", () => {
            const localUrl = "file:///storage/emulated/0/Download/AGTV_LUIS/" + item.fileName;
            
            if (typeof AndroidBridge !== "undefined") {
                showToast("Reproduciendo archivo descargado...", "success");
                if (AndroidBridge.playNativeStreamFull) {
                    AndroidBridge.playNativeStreamFull(localUrl, "[Local] " + item.name, "Descarga local");
                } else {
                    AndroidBridge.playNativeStream(localUrl, "[Local] " + item.name);
                }
            } else {
                showToast("Modo Web - Fichero local: " + localUrl, "info");
            }
        });
        
        streamsContainer.appendChild(card);
    });
}

