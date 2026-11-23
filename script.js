const hashed_data = "96a8f45187e9360673b36d3b6fa2dedccae4a05522241b80e8632a41ef4d1be2";

const viewRoutes = {
    homeView: 'home',
    addView: 'add-animal',
    listView: 'animals',
    detailView: 'animal-detail',
    syncView: 'sync'
};

const routeViews = Object.fromEntries(
    Object.entries(viewRoutes).map(([viewId, route]) => [route, viewId])
);

let db;
let base64Hayvan = "";
let base64Anne = "";
let allData = [];
let allDataById = new Map();
let filteredData = [];
let currentView = null;
let selectedAnimalId = null;
let editReturnView = 'listView';
let isDataLoaded = false;
let isDataLoading = false;
let isListDirty = true;
let imageObserver = null;

function parseRouteFromHash() {
    const rawHash = window.location.hash.slice(1);
    if (rawHash.startsWith(`${viewRoutes.detailView}/`)) {
        const parsedId = Number(rawHash.slice(viewRoutes.detailView.length + 1));
        if (Number.isFinite(parsedId) && parsedId > 0) {
            return { viewId: 'detailView', animalId: parsedId };
        }
        return { viewId: 'listView', animalId: null };
    }
    return { viewId: routeViews[rawHash] || 'homeView', animalId: null };
}

if (sessionStorage.getItem("loggedIn") === "true") {
    showApp();
}

async function checkPassword() {
    const input = document.getElementById('appPassword').value;
    if (!input) return;

    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    if (hashHex === hashed_data) {
        sessionStorage.setItem("loggedIn", "true");
        showApp();
    } else {
        document.getElementById('passwordError').style.display = 'block';
        document.getElementById('appPassword').value = "";
    }
}

function showApp() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    document.getElementById('bottomNav').style.display = 'flex'; // Navigasyonu aç
    const { viewId: initialView, animalId } = parseRouteFromHash();
    const initialRoute = initialView === 'detailView' && animalId
        ? `${viewRoutes.detailView}/${animalId}`
        : viewRoutes[initialView];
    history.replaceState({ appView: initialView, animalId }, '', `${window.location.pathname}${window.location.search}#${initialRoute}`);
    switchView(initialView, false, animalId);
    if (db && !isDataLoaded && !isDataLoading) {
        loadData();
    }
}

function handleEnter(e) {
    if (e.key === 'Enter') {
        checkPassword();
    }
}

// YENİ: Ekranlar Arası Geçiş Fonksiyonu
function switchView(viewId, updateHistory = true, animalId = null) {
    const route = viewRoutes[viewId];
    if (!route) return;

    currentView = viewId;
    if (viewId === 'detailView' && animalId !== null && animalId !== undefined) {
        selectedAnimalId = Number(animalId);
    }

    const targetHash = viewId === 'detailView' && selectedAnimalId
        ? `#${route}/${selectedAnimalId}`
        : `#${route}`;

    if (updateHistory && window.location.hash !== targetHash) {
        history.pushState({ appView: viewId, animalId: viewId === 'detailView' ? selectedAnimalId : null }, '', targetHash);
    }

    // 1. Tüm sayfaları gizle
    document.querySelectorAll('.view-section').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active-view');
    });
    
    // 2. İstenilen sayfayı göster ve animasyon class'ını ekle
    const targetView = document.getElementById(viewId);
    targetView.style.display = 'block';
    setTimeout(() => targetView.classList.add('active-view'), 10);

    // 3. Alt menüdeki (Bottom Nav) butonların renklerini güncelle
    document.querySelectorAll('.bottom-nav button').forEach(btn => btn.classList.remove('active'));
    const navViewId = viewId === 'detailView' ? 'listView' : viewId;
    const activeBtn = document.querySelector(`.bottom-nav button[onclick="switchView('${navViewId}')"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // 4. Sayfayı en üste kaydır
    window.scrollTo(0, 0);

    // 5. Liste veya detay ekranı açıldığında verileri/kartları yükle
    if (viewId === 'listView') {
        if (!isDataLoaded) {
            const container = document.getElementById('cardContainer');
            if (container && !container.innerHTML) {
                container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #666; font-style: italic; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">Kayıtlar yükleniyor...</div>`;
            }
            if (db && !isDataLoading) {
                loadData();
            }
        } else if (isListDirty) {
            applyFilter();
        } else {
            observeLazyCardImages(document.getElementById('cardContainer'));
        }
    } else if (viewId === 'detailView') {
        if (!isDataLoaded) {
            const detailContainer = document.getElementById('animalDetailContainer');
            if (detailContainer) {
                detailContainer.innerHTML = `<div class="card" style="text-align: center; color: #666; font-style: italic;">Hayvan bilgileri yükleniyor...</div>`;
            }
            if (db && !isDataLoading) {
                loadData();
            }
        } else {
            renderAnimalDetail(selectedAnimalId);
        }
    }
}

window.addEventListener('popstate', (event) => {
    const parsed = parseRouteFromHash();
    const viewId = parsed.viewId || event.state?.appView || 'homeView';
    const animalId = parsed.animalId ?? event.state?.animalId ?? null;
    switchView(viewId, false, animalId);
});

const request = indexedDB.open("CiftlikPro", 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("kayitlar")) {
        db.createObjectStore("kayitlar", { keyPath: "id", autoIncrement: true });
    }
};
request.onsuccess = (e) => {
    db = e.target.result;
    if (sessionStorage.getItem("loggedIn") === "true" && !isDataLoaded && !isDataLoading) {
        loadData();
    }
};

function handleImageUpload(inputId, previewId, isAnne) {
    document.getElementById(inputId).addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

                if (isAnne) {
                    base64Anne = compressedBase64;
                    document.getElementById('removeAnneBtn').style.display = 'flex';
                } else {
                    base64Hayvan = compressedBase64;
                    document.getElementById('removeHayvanBtn').style.display = 'flex';
                }

                const imgObj = document.getElementById(previewId);
                imgObj.src = compressedBase64;
                imgObj.style.display = 'block';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}
handleImageUpload('hayvanResmi', 'previewHayvan', false);
handleImageUpload('anneResmi', 'previewAnne', true);

window.removeImage = function (type) {
    if (type === 'hayvan') {
        base64Hayvan = "";
        document.getElementById('hayvanResmi').value = "";
        document.getElementById('previewHayvan').style.display = 'none';
        document.getElementById('removeHayvanBtn').style.display = 'none';
        document.getElementById('previewHayvan').src = "";
    } else if (type === 'anne') {
        base64Anne = "";
        document.getElementById('anneResmi').value = "";
        document.getElementById('previewAnne').style.display = 'none';
        document.getElementById('removeAnneBtn').style.display = 'none';
        document.getElementById('previewAnne').src = "";
    }
};

window.toggleMilkingFormField = function () {
    const cinsiyetEl = document.getElementById('cinsiyet');
    const groupEl = document.getElementById('milkingFormGroup');
    const checkboxEl = document.getElementById('isMilking');
    if (!cinsiyetEl || !groupEl || !checkboxEl) return;

    if (cinsiyetEl.value === 'Dişi') {
        groupEl.style.display = 'block';
    } else {
        groupEl.style.display = 'none';
        checkboxEl.checked = false;
    }
};

document.getElementById('animalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const cinsiyetVal = document.getElementById('cinsiyet').value;
    const isMilkingVal = cinsiyetVal === 'Dişi' ? document.getElementById('isMilking').checked : false;
    const data = {
        kupeNo: document.getElementById('kupeNo').value,
        hayvanLakabi: document.getElementById('hayvanLakabi').value,
        cinsiyet: cinsiyetVal,
        hayvanCinsi: document.getElementById('hayvanCinsi').value,
        dogumTarihi: document.getElementById('dogumTarihi').value,
        anneKupeNo: document.getElementById('anneKupeNo').value,
        anneCinsi: document.getElementById('anneCinsi').value,
        kogustuguTarih: document.getElementById('kogustuguTarih').value,
        hayvanResmi: base64Hayvan,
        anneResmi: base64Anne,
        isMilking: isMilkingVal,
        milkRecords: []
    };

    const editId = document.getElementById('editId').value;
    const returnTargetView = editId ? editReturnView : 'listView';
    const editedAnimalId = editId ? Number(editId) : null;
    if (editId) {
        data.id = editedAnimalId;
        const existingRecord = allData.find(row => row.id === data.id);
        if (existingRecord) {
            data.herdStatus = existingRecord.herdStatus || 'active';
            data.exitReason = existingRecord.exitReason || '';
            data.exitDate = existingRecord.exitDate || '';
            data.salePrice = existingRecord.salePrice ?? null;
            data.milkRecords = Array.isArray(existingRecord.milkRecords) ? existingRecord.milkRecords : [];
        }
    }

    const tx = db.transaction("kayitlar", "readwrite");
    const store = tx.objectStore("kayitlar");

    if (editId) store.put(data);
    else store.add(data);

    tx.oncomplete = () => {
        resetAnimalForm();
        loadData();
        Swal.fire({
            title: "Başarılı!",
            text: "Hayvan kaydı başarıyla " + (editId ? "güncellendi!" : "eklendi!"),
            icon: "success",
            confirmButtonColor: "#28a745",
            confirmButtonText: 'Tamam',
        }).then(() => {
            if (returnTargetView === 'detailView' && editedAnimalId) {
                openAnimalDetail(editedAnimalId);
            } else {
                switchView('listView');
            }
        });
    };


    /// tireşim
    
    if ("vibrate" in navigator) {
    navigator.vibrate(500); 

    } else {
        alert("Bu cihaz veya tarayıcı titreşim özelliğini desteklemiyor.");
    }
});

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDateTR(dateStr) {
    if (!dateStr) return '-';
    const parts = String(dateStr).split('-');
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return dateStr;
}

function formatLiters(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function isAnimalMilking(row) {
    return Boolean(row && row.cinsiyet === 'Dişi' && row.isMilking);
}

function getMilkRecords(row) {
    if (!row || !Array.isArray(row.milkRecords)) return [];
    return [...row.milkRecords].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function loadData() {
    if (!db) return;
    isDataLoading = true;
    const tx = db.transaction("kayitlar", "readonly");
    const req = tx.objectStore("kayitlar").getAll();

    req.onsuccess = () => {
        isDataLoading = false;
        isDataLoaded = true;
        isListDirty = true;
        allData = req.result.sort((a, b) => a.id - b.id);
        allDataById = new Map(allData.map(row => [row.id, row]));
        const activeCount = allData.filter(row => !row.herdStatus || row.herdStatus === 'active').length;
        document.getElementById('totalCount').innerText = "Sürüdeki Hayvan Sayısı: " + activeCount;
        if (currentView === 'listView') {
            applyFilter();
        } else if (currentView === 'detailView') {
            renderAnimalDetail(selectedAnimalId);
        }
    };
    req.onerror = () => {
        isDataLoading = false;
    };
}

function hydrateCardImages(card) {
    const slots = card.querySelectorAll('.card-img-slot');
    slots.forEach(slot => {
        const animal = allDataById.get(Number(slot.dataset.id));
        const field = slot.dataset.field;
        const src = animal ? animal[field] : '';
        if (!src) return;

        const img = document.createElement('img');
        img.className = 'card-img';
        img.decoding = 'async';
        img.src = src;
        img.onclick = () => openModal(src);
        slot.replaceWith(img);
    });
    card.removeAttribute('data-has-lazy');
}

function observeLazyCardImages(container) {
    if (imageObserver) {
        imageObserver.disconnect();
        imageObserver = null;
    }
    if (!container) return;

    const lazyCards = container.querySelectorAll('.animal-card[data-has-lazy="1"]');
    if (!lazyCards.length) return;

    if ('IntersectionObserver' in window) {
        imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    hydrateCardImages(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, { rootMargin: '300px 0px' });

        lazyCards.forEach(card => imageObserver.observe(card));
    } else {
        lazyCards.forEach(hydrateCardImages);
    }
}

window.openAnimalImage = function (id, field) {
    const animal = allDataById.get(Number(id));
    if (!animal || !animal[field]) return;
    openModal(animal[field]);
};

function renderTable() {
    // Artık tablo tbody yerine, kartları koyacağımız div'i seçiyoruz
    const container = document.getElementById('cardContainer');

    if (imageObserver) {
        imageObserver.disconnect();
        imageObserver = null;
    }

    if (filteredData.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #666; font-style: italic; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">Aradığınız kriterlere uygun hayvan bulunamadı.</div>`;
        return;
    }

    const exitLabels = { sold: 'Satıldı', dead: 'Öldü', transferred: 'Başka işletmeye geçti' };
    const htmlParts = filteredData.map((row, index) => {
        // Resim varsa ekrana geldiğinde yüklenmesi için hafif yer tutucu ekle
        const hayvanResmiHtml = row.hayvanResmi
            ? `<div class="card-img-slot" data-id="${row.id}" data-field="hayvanResmi" onclick="openAnimalImage(${row.id}, 'hayvanResmi')"></div>`
            : '<div class="card-no-img">Fotoğraf Yok</div>';
        const anneResmiHtml = row.anneResmi
            ? `<div class="card-img-slot" data-id="${row.id}" data-field="anneResmi" onclick="openAnimalImage(${row.id}, 'anneResmi')"></div>`
            : '<div class="card-no-img">Fotoğraf Yok</div>';
        const hasLazyImages = Boolean(row.hayvanResmi || row.anneResmi);
        const isActive = !row.herdStatus || row.herdStatus === 'active';
        const milking = isAnimalMilking(row);
        const milkRecords = row.cinsiyet === 'Dişi' ? getMilkRecords(row) : [];
        const latestMilk = milkRecords[0] || null;
        const latestMilkHtml = latestMilk
            ? `<div class="card-info-row"><strong>Son Süt (${formatDateTR(latestMilk.date)}):</strong> <span>${formatLiters((Number(latestMilk.morning) || 0) + (Number(latestMilk.evening) || 0))} L</span></div>`
            : '';
        const exitDetailsHtml = isActive ? '' : `
            <div class="card-info-row"><strong>Durum:</strong> <span>${exitLabels[row.herdStatus] || 'Sürüden çıktı'}</span></div>
            <div class="card-info-row"><strong>Çıkış Tarihi:</strong> <span>${row.exitDate || '-'}</span></div>
            ${row.herdStatus === 'sold' ? `<div class="card-info-row"><strong>Satış Fiyatı:</strong> <span>${Number(row.salePrice || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</span></div>` : ''}
        `;
        const herdActionHtml = isActive
            ? `<button class="btn-warning" onclick="markAnimalExited(${row.id})">Sürüden Çıkar</button>`
            : `<button class="btn-success" onclick="restoreAnimalToHerd(${row.id})">Sürüye Geri Al</button>`;

        // Kart şablonu
        return `
            <div class="animal-card"${hasLazyImages ? ' data-has-lazy="1"' : ''}>
                <div class="card-header card-header-clickable" onclick="openAnimalDetail(${row.id})" title="Hayvan detayını görüntüle">
                    <h3>Küpe: ${escapeHtml(row.kupeNo)}</h3>
                    <div class="card-badges">
                        ${milking ? '<span class="card-badge-milking">🥛 Sağılır</span>' : ''}
                        <span class="card-badge">#${index + 1}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="card-info-row"><strong>Lakap:</strong> <span>${escapeHtml(row.hayvanLakabi || '-')}</span></div>
                    <div class="card-info-row"><strong>Cinsiyet:</strong> <span>${escapeHtml(row.cinsiyet)}</span></div>
                    <div class="card-info-row"><strong>Irk:</strong> <span>${escapeHtml(row.hayvanCinsi)}</span></div>
                    <div class="card-info-row"><strong>Doğum Tarihi:</strong> <span>${row.dogumTarihi || '-'}</span></div>
                    <div class="card-info-row"><strong>Koğuştuğu Tarih:</strong> <span>${row.kogustuguTarih || '-'}</span></div>
                    <div class="card-info-row"><strong>Anne Küpe No:</strong> <span>${escapeHtml(row.anneKupeNo || '-')}</span></div>
                    ${latestMilkHtml}
                    ${exitDetailsHtml}
                    
                    <div class="card-images">
                        <div class="card-img-box">
                            <p>Hayvan Resmi</p>
                            ${hayvanResmiHtml}
                        </div>
                        <div class="card-img-box">
                            <p>Anne Resmi</p>
                            ${anneResmiHtml}
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="btn-detail" onclick="openAnimalDetail(${row.id})">📋 Detay</button>
                    <button class="btn-info" onclick="startEdit(${row.id})">✏️ Düzenle</button>
                    ${herdActionHtml}
                    <button class="btn-danger" onclick="deleteData(${row.id})">Kalıcı Sil</button>
                </div>
            </div>
        `;
    });

    container.innerHTML = htmlParts.join('');
    observeLazyCardImages(container);
}

window.openAnimalDetail = function (id) {
    const numericId = Number(id);
    if (!Number.isFinite(numericId)) return;
    selectedAnimalId = numericId;
    switchView('detailView', true, numericId);
};

function renderAnimalDetail(id) {
    const container = document.getElementById('animalDetailContainer');
    if (!container) return;

    const animal = allDataById.get(Number(id));
    if (!animal) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 2rem;">
                <p style="color: #666; margin-bottom: 1rem;">Hayvan kaydı bulunamadı.</p>
                <button class="btn-primary" style="max-width: 240px;" onclick="switchView('listView')">Hayvan Listesine Dön</button>
            </div>
        `;
        return;
    }

    const isActive = !animal.herdStatus || animal.herdStatus === 'active';
    const isFemale = animal.cinsiyet === 'Dişi';
    const milking = isAnimalMilking(animal);
    const exitLabels = { sold: 'Satıldı', dead: 'Öldü', transferred: 'Başka işletmeye geçti' };
    const statusBadge = isActive
        ? '<span class="card-badge">Aktif Sürüde</span>'
        : `<span class="card-badge-exited">${escapeHtml(exitLabels[animal.herdStatus] || 'Sürüden çıktı')}</span>`;

    const herdActionHtml = isActive
        ? `<button class="btn-warning" onclick="markAnimalExited(${animal.id})">Sürüden Çıkar</button>`
        : `<button class="btn-success" onclick="restoreAnimalToHerd(${animal.id})">Sürüye Geri Al</button>`;

    const exitInfoItems = isActive ? '' : `
        <div class="detail-info-item">
            <span class="detail-info-label">Çıkış Nedeni</span>
            <span class="detail-info-value">${escapeHtml(exitLabels[animal.herdStatus] || 'Sürüden çıktı')}</span>
        </div>
        <div class="detail-info-item">
            <span class="detail-info-label">Çıkış Tarihi</span>
            <span class="detail-info-value">${formatDateTR(animal.exitDate)}</span>
        </div>
        ${animal.herdStatus === 'sold' ? `
            <div class="detail-info-item">
                <span class="detail-info-label">Satış Fiyatı</span>
                <span class="detail-info-value">${Number(animal.salePrice || 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</span>
            </div>
        ` : ''}
    `;

    const hayvanResmiHtml = animal.hayvanResmi
        ? `<img src="${animal.hayvanResmi}" class="detail-img" decoding="async" onclick="openAnimalImage(${animal.id}, 'hayvanResmi')" title="Büyütmek için tıklayın">`
        : '<div class="card-no-img" style="height: 190px;">Fotoğraf Yok</div>';
    const anneResmiHtml = animal.anneResmi
        ? `<img src="${animal.anneResmi}" class="detail-img" decoding="async" onclick="openAnimalImage(${animal.id}, 'anneResmi')" title="Büyütmek için tıklayın">`
        : '<div class="card-no-img" style="height: 190px;">Fotoğraf Yok</div>';

    let milkSectionHtml = '';
    if (isFemale) {
        const records = getMilkRecords(animal);
        const today = getTodayDateString();
        const todayRecord = records.find(r => r.date === today) || null;
        const initialMorning = todayRecord && todayRecord.morning !== undefined && todayRecord.morning !== null ? todayRecord.morning : '';
        const initialEvening = todayRecord && todayRecord.evening !== undefined && todayRecord.evening !== null ? todayRecord.evening : '';
        const initialTotal = (Number(initialMorning) || 0) + (Number(initialEvening) || 0);

        const latestRecord = records[0] || null;
        const latestTotal = latestRecord ? (Number(latestRecord.morning) || 0) + (Number(latestRecord.evening) || 0) : 0;
        const recent7 = records.slice(0, 7);
        const avg7 = recent7.length
            ? recent7.reduce((sum, r) => sum + (Number(r.morning) || 0) + (Number(r.evening) || 0), 0) / recent7.length
            : 0;
        const grandTotal = records.reduce((sum, r) => sum + (Number(r.morning) || 0) + (Number(r.evening) || 0), 0);

        const historyHtml = records.length === 0
            ? '<div class="milk-empty-state">Henüz süt kaydı girilmedi. Yukarıdaki alandan sabah ve akşam süt miktarlarını ekleyebilirsiniz.</div>'
            : `<div class="milk-history-list">${records.map(rec => {
                const m = Number(rec.morning) || 0;
                const e = Number(rec.evening) || 0;
                const total = m + e;
                return `
                    <div class="milk-history-item">
                        <div class="milk-history-main">
                            <span class="milk-history-date">📅 ${formatDateTR(rec.date)}</span>
                            <div class="milk-history-values">
                                <span>🌅 Sabah: <strong>${formatLiters(m)} L</strong></span>
                                <span>🌇 Akşam: <strong>${formatLiters(e)} L</strong></span>
                                <span class="milk-history-total">Toplam: ${formatLiters(total)} L</span>
                            </div>
                        </div>
                        <div class="milk-history-actions">
                            <button type="button" class="btn-info" onclick="editMilkRecord(${animal.id}, '${rec.date}')" title="Düzenle">✏️</button>
                            <button type="button" class="btn-danger" onclick="deleteMilkRecord(${animal.id}, '${rec.date}')" title="Sil">🗑️</button>
                        </div>
                    </div>
                `;
            }).join('')}</div>`;

        milkSectionHtml = `
            <div class="card">
                <div class="milk-section-header">
                    <h3>🥛 Günlük Süt Takibi</h3>
                    <label class="milking-toggle-label">
                        <input type="checkbox" id="detailMilkingToggle" ${milking ? 'checked' : ''} onchange="toggleAnimalMilking(${animal.id}, this.checked)">
                        <span>Sağılır Hayvan</span>
                    </label>
                </div>

                <form id="milkEntryForm" onsubmit="saveMilkRecord(event, ${animal.id})">
                    <div class="milk-form-grid">
                        <div class="form-group milk-date-group" style="margin-bottom: 0;">
                            <label for="milkDate">Tarih</label>
                            <input type="date" id="milkDate" value="${today}" required onchange="syncMilkFormForDate(${animal.id}, this.value)">
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label for="milkMorning">🌅 Sabah Sütü (L)</label>
                            <input type="number" id="milkMorning" min="0" step="0.1" inputmode="decimal" placeholder="Örn. 12.5" value="${initialMorning}" oninput="updateMilkTotalPreview()">
                        </div>
                        <div class="form-group" style="margin-bottom: 0;">
                            <label for="milkEvening">🌇 Akşam Sütü (L)</label>
                            <input type="number" id="milkEvening" min="0" step="0.1" inputmode="decimal" placeholder="Örn. 10.5" value="${initialEvening}" oninput="updateMilkTotalPreview()">
                        </div>
                    </div>

                    <div class="milk-total-preview">
                        <span>Seçili Gün Toplamı</span>
                        <span id="milkDailyTotalPreview">${formatLiters(initialTotal)} Litre</span>
                    </div>

                    <button type="submit" class="btn-primary">💾 Süt Kaydını Kaydet</button>
                </form>

                <div class="milk-stats-grid">
                    <div class="milk-stat-card">
                        <span class="milk-stat-label">Son Kayıt</span>
                        <span class="milk-stat-value">${latestRecord ? `${formatLiters(latestTotal)} L` : '-'}</span>
                    </div>
                    <div class="milk-stat-card">
                        <span class="milk-stat-label">Son ${recent7.length || 7} Gün Ort.</span>
                        <span class="milk-stat-value">${recent7.length ? `${formatLiters(avg7)} L` : '-'}</span>
                    </div>
                    <div class="milk-stat-card">
                        <span class="milk-stat-label">Toplam (${records.length} gün)</span>
                        <span class="milk-stat-value">${records.length ? `${formatLiters(grandTotal)} L` : '-'}</span>
                    </div>
                </div>

                <h4 class="milk-history-title">Süt Geçmişi</h4>
                ${historyHtml}
            </div>
        `;
    }

    container.innerHTML = `
        <div class="card">
            <div class="detail-header">
                <div>
                    <h2>Küpe: ${escapeHtml(animal.kupeNo)}</h2>
                    ${animal.hayvanLakabi ? `<p class="detail-subtitle">Lakap: ${escapeHtml(animal.hayvanLakabi)}</p>` : ''}
                </div>
                <div class="card-badges">
                    ${milking ? '<span class="card-badge-milking">🥛 Sağılır</span>' : ''}
                    ${statusBadge}
                </div>
            </div>

            <div class="detail-info-grid">
                <div class="detail-info-item">
                    <span class="detail-info-label">Cinsiyet</span>
                    <span class="detail-info-value">${escapeHtml(animal.cinsiyet || '-')}</span>
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">Irk</span>
                    <span class="detail-info-value">${escapeHtml(animal.hayvanCinsi || '-')}</span>
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">Doğum Tarihi</span>
                    <span class="detail-info-value">${formatDateTR(animal.dogumTarihi)}</span>
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">Koğuştuğu Tarih</span>
                    <span class="detail-info-value">${formatDateTR(animal.kogustuguTarih)}</span>
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">Anne Küpe No</span>
                    <span class="detail-info-value">${escapeHtml(animal.anneKupeNo || '-')}</span>
                </div>
                <div class="detail-info-item">
                    <span class="detail-info-label">Annesinin Cinsi</span>
                    <span class="detail-info-value">${escapeHtml(animal.anneCinsi || '-')}</span>
                </div>
                ${exitInfoItems}
            </div>

            <div class="detail-images">
                <div class="detail-img-box">
                    <p>Hayvan Resmi</p>
                    ${hayvanResmiHtml}
                </div>
                <div class="detail-img-box">
                    <p>Anne Resmi</p>
                    ${anneResmiHtml}
                </div>
            </div>

            <div class="detail-actions">
                <button class="btn-info" onclick="startEdit(${animal.id})">✏️ Düzenle</button>
                ${herdActionHtml}
                <button class="btn-danger" onclick="deleteData(${animal.id})">Kalıcı Sil</button>
            </div>
        </div>
        ${milkSectionHtml}
    `;
}

function updateAnimalRecordInDB(updatedAnimal, onSuccess) {
    const tx = db.transaction("kayitlar", "readwrite");
    tx.objectStore("kayitlar").put(updatedAnimal);
    tx.oncomplete = () => {
        const idx = allData.findIndex(r => r.id === updatedAnimal.id);
        if (idx !== -1) {
            allData[idx] = updatedAnimal;
        }
        allDataById.set(updatedAnimal.id, updatedAnimal);
        isListDirty = true;
        if (onSuccess) onSuccess();
    };
}

window.syncMilkFormForDate = function (animalId, dateStr) {
    const animal = allDataById.get(Number(animalId));
    const morningInput = document.getElementById('milkMorning');
    const eveningInput = document.getElementById('milkEvening');
    if (!animal || !morningInput || !eveningInput) return;

    const existing = getMilkRecords(animal).find(r => r.date === dateStr);
    morningInput.value = existing && existing.morning !== undefined && existing.morning !== null ? existing.morning : '';
    eveningInput.value = existing && existing.evening !== undefined && existing.evening !== null ? existing.evening : '';
    updateMilkTotalPreview();
};

window.updateMilkTotalPreview = function () {
    const previewEl = document.getElementById('milkDailyTotalPreview');
    if (!previewEl) return;
    const morning = Number(document.getElementById('milkMorning')?.value) || 0;
    const evening = Number(document.getElementById('milkEvening')?.value) || 0;
    previewEl.innerText = `${formatLiters(morning + evening)} Litre`;
};

window.toggleAnimalMilking = function (id, checked) {
    const animal = allDataById.get(Number(id));
    if (!animal || animal.cinsiyet !== 'Dişi') return;

    const updatedAnimal = {
        ...animal,
        isMilking: Boolean(checked)
    };
    updateAnimalRecordInDB(updatedAnimal, () => {
        renderAnimalDetail(updatedAnimal.id);
    });
};

window.saveMilkRecord = function (event, id) {
    event.preventDefault();
    const animal = allDataById.get(Number(id));
    if (!animal || animal.cinsiyet !== 'Dişi') return;

    const dateStr = document.getElementById('milkDate')?.value;
    const rawMorning = document.getElementById('milkMorning')?.value.trim() ?? '';
    const rawEvening = document.getElementById('milkEvening')?.value.trim() ?? '';

    if (!dateStr) {
        Swal.fire({ title: 'Uyarı', text: 'Lütfen tarih seçin.', icon: 'warning', confirmButtonText: 'Tamam' });
        return;
    }

    if (rawMorning === '' && rawEvening === '') {
        Swal.fire({ title: 'Uyarı', text: 'Lütfen sabah veya akşam süt miktarını girin.', icon: 'warning', confirmButtonText: 'Tamam' });
        return;
    }

    const morning = rawMorning === '' ? 0 : Number(rawMorning);
    const evening = rawEvening === '' ? 0 : Number(rawEvening);

    if (!Number.isFinite(morning) || morning < 0 || !Number.isFinite(evening) || evening < 0) {
        Swal.fire({ title: 'Hata', text: 'Geçerli bir süt miktarı girin.', icon: 'error', confirmButtonText: 'Tamam' });
        return;
    }

    const existingRecords = getMilkRecords(animal).filter(r => r.date !== dateStr);
    existingRecords.push({ date: dateStr, morning, evening });
    existingRecords.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const shouldAutoMarkMilking = (morning > 0 || evening > 0) ? true : Boolean(animal.isMilking);
    const updatedAnimal = {
        ...animal,
        isMilking: shouldAutoMarkMilking,
        milkRecords: existingRecords
    };

    updateAnimalRecordInDB(updatedAnimal, () => {
        renderAnimalDetail(updatedAnimal.id);
        const dateInput = document.getElementById('milkDate');
        if (dateInput) {
            dateInput.value = dateStr;
            syncMilkFormForDate(updatedAnimal.id, dateStr);
        }
        Swal.fire({
            title: 'Kaydedildi!',
            text: `${formatDateTR(dateStr)} tarihli günlük toplam: ${formatLiters(morning + evening)} Litre`,
            icon: 'success',
            timer: 1600,
            showConfirmButton: false
        });
    });
};

window.editMilkRecord = function (id, dateStr) {
    const dateInput = document.getElementById('milkDate');
    if (!dateInput) return;
    dateInput.value = dateStr;
    syncMilkFormForDate(id, dateStr);
    const formEl = document.getElementById('milkEntryForm');
    if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.deleteMilkRecord = function (id, dateStr) {
    const animal = allDataById.get(Number(id));
    if (!animal) return;

    Swal.fire({
        title: 'Süt kaydını sil?',
        text: `${formatDateTR(dateStr)} tarihli süt kaydı silinecek.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Evet, Sil',
        cancelButtonText: 'İptal'
    }).then(result => {
        if (!result.isConfirmed) return;
        const remaining = getMilkRecords(animal).filter(r => r.date !== dateStr);
        const updatedAnimal = {
            ...animal,
            milkRecords: remaining
        };
        updateAnimalRecordInDB(updatedAnimal, () => {
            renderAnimalDetail(updatedAnimal.id);
        });
    });
};

window.startEdit = function (rowOrId) {
    const row = typeof rowOrId === 'object' && rowOrId !== null ? rowOrId : allDataById.get(Number(rowOrId));
    if (!row) return;

    editReturnView = currentView === 'detailView' ? 'detailView' : 'listView';

    // Listede düzenleye basıldığında otomatik form ekranına yönlendir
    switchView('addView');

    document.getElementById('formTitle').innerText = "Kayıt Düzenle";
    document.getElementById('submitBtn').innerText = "Güncelle";
    const cancelBtn = document.getElementById('cancelEditBtn');
    cancelBtn.style.display = "block";
    cancelBtn.innerText = editReturnView === 'detailView' ? "İptal Et ve Detaya Dön" : "İptal Et ve Listeye Dön";

    document.getElementById('editId').value = row.id;
    document.getElementById('kupeNo').value = row.kupeNo;
    document.getElementById('hayvanLakabi').value = row.hayvanLakabi || "";
    document.getElementById('cinsiyet').value = row.cinsiyet;
    document.getElementById('isMilking').checked = isAnimalMilking(row);
    toggleMilkingFormField();
    document.getElementById('hayvanCinsi').value = row.hayvanCinsi;
    document.getElementById('dogumTarihi').value = row.dogumTarihi;
    document.getElementById('anneKupeNo').value = row.anneKupeNo;
    document.getElementById('anneCinsi').value = row.anneCinsi;
    document.getElementById('kogustuguTarih').value = row.kogustuguTarih;

    base64Hayvan = row.hayvanResmi || "";
    base64Anne = row.anneResmi || "";

    const prevHayvan = document.getElementById('previewHayvan');
    const prevAnne = document.getElementById('previewAnne');

    if (base64Hayvan) {
        prevHayvan.src = base64Hayvan;
        prevHayvan.style.display = 'block';
        document.getElementById('removeHayvanBtn').style.display = 'flex';
    } else {
        prevHayvan.style.display = 'none';
        document.getElementById('removeHayvanBtn').style.display = 'none';
    }

    if (base64Anne) {
        prevAnne.src = base64Anne;
        prevAnne.style.display = 'block';
        document.getElementById('removeAnneBtn').style.display = 'flex';
    } else {
        prevAnne.style.display = 'none';
        document.getElementById('removeAnneBtn').style.display = 'none';
    }
};

function resetAnimalForm() {
    document.getElementById('animalForm').reset();
    document.getElementById('editId').value = "";
    document.getElementById('formTitle').innerText = "Yeni Hayvan Ekle";
    document.getElementById('submitBtn').innerText = "Kaydet";
    document.getElementById('cancelEditBtn').style.display = "none";
    document.getElementById('cancelEditBtn').innerText = "İptal Et ve Listeye Dön";
    document.getElementById('isMilking').checked = false;
    toggleMilkingFormField();

    document.getElementById('previewHayvan').style.display = 'none';
    document.getElementById('previewAnne').style.display = 'none';
    document.getElementById('removeHayvanBtn').style.display = 'none';
    document.getElementById('removeAnneBtn').style.display = 'none';

    base64Hayvan = "";
    base64Anne = "";
    editReturnView = 'listView';
}

window.cancelEdit = function () {
    const editId = document.getElementById('editId').value;
    const isEditing = editId !== "";
    const targetView = editReturnView;
    const editedId = Number(editId);

    resetAnimalForm();

    // Eğer düzenlemeden iptale basıldıysa, önceki ekrana geri dön
    if (isEditing) {
        if (targetView === 'detailView' && editedId) {
            openAnimalDetail(editedId);
        } else {
            switchView('listView');
        }
    }
};

window.deleteData = function (id) {
    Swal.fire({
        title: 'Emin misiniz?',
        text: "Bu kaydı silmek istediğinize emin misiniz?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Evet, Sil!',
        cancelButtonText: 'İptal'
    }).then((result) => {
        if (result.isConfirmed) {
            const wasInDeletedDetail = currentView === 'detailView' && Number(selectedAnimalId) === Number(id);
            const tx = db.transaction("kayitlar", "readwrite");
            tx.objectStore("kayitlar").delete(id);
            tx.oncomplete = () => {
                if (wasInDeletedDetail) {
                    selectedAnimalId = null;
                    switchView('listView');
                }
                loadData();
                Swal.fire({
                    title: 'Silindi!',
                    text: 'Kayıt başarıyla silindi',
                    icon: 'success',
                    confirmButtonText: 'Kapat'
                });
            };
        }
    });
};

window.markAnimalExited = function (id) {
    const animal = allData.find(row => row.id === id);
    if (!animal) return;

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    Swal.fire({
        title: `Sürüden çıkar: ${animal.kupeNo}`,
        html: `
            <label for="exitReason">Çıkış nedeni</label>
            <select id="exitReason">
                <option value="sold">Satıldı</option>
                <option value="dead">Öldü</option>
                <option value="transferred">Başka işletmeye geçti</option>
            </select>
            <label for="exitDate">Çıkış tarihi</label>
            <input id="exitDate"  type="date" value="${today}">
            <div id="salePriceField">
                <label for="salePrice">Satış fiyatı (TL)</label>
                <input id="salePrice"  type="number" min="0" step="0.01" inputmode="decimal" placeholder="Örn. 85000">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Kaydet',
        cancelButtonText: 'İptal',
        confirmButtonColor: '#28a745',
        didOpen: () => {
            const reasonSelect = document.getElementById('exitReason');
            const salePriceField = document.getElementById('salePriceField');
            const updateSalePriceVisibility = () => {
                salePriceField.style.display = reasonSelect.value === 'sold' ? 'block' : 'none';
            };
            reasonSelect.addEventListener('change', updateSalePriceVisibility);
            updateSalePriceVisibility();
        },
        preConfirm: () => {
            const exitReason = document.getElementById('exitReason').value;
            const exitDate = document.getElementById('exitDate').value;
            const rawPrice = document.getElementById('salePrice').value.trim();
            const salePrice = Number(rawPrice);

            if (!exitDate) {
                Swal.showValidationMessage('Çıkış tarihini girin.');
                return false;
            }
            if (exitReason === 'sold' && (!rawPrice || !Number.isFinite(salePrice) || salePrice < 0)) {
                Swal.showValidationMessage('Satış fiyatını TL olarak girin.');
                return false;
            }

            return { exitReason, exitDate, salePrice: exitReason === 'sold' ? salePrice : null };
        }
    }).then(result => {
        if (!result.isConfirmed) return;

        const updatedAnimal = {
            ...animal,
            herdStatus: result.value.exitReason,
            exitReason: result.value.exitReason,
            exitDate: result.value.exitDate,
            salePrice: result.value.salePrice
        };
        const tx = db.transaction('kayitlar', 'readwrite');
        tx.objectStore('kayitlar').put(updatedAnimal);
        tx.oncomplete = () => {
            loadData();
            Swal.fire({
                title: 'Kayıt güncellendi',
                text: result.value.exitReason === 'sold'
                    ? `Satış fiyatı: ${result.value.salePrice.toLocaleString('tr-TR')} TL`
                    : 'Hayvan sürüden çıkarıldı.',
                icon: 'success',
                confirmButtonText: 'Tamam'
            });
        };
    });
};

window.restoreAnimalToHerd = function (id) {
    const animal = allData.find(row => row.id === id);
    if (!animal) return;

    Swal.fire({
        title: 'Hayvanı sürüye geri al?',
        text: `Küpe numarası: ${animal.kupeNo}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Geri Al',
        cancelButtonText: 'İptal'
    }).then(result => {
        if (!result.isConfirmed) return;

        const restoredAnimal = { ...animal, herdStatus: 'active', exitReason: '', exitDate: '', salePrice: null };
        const tx = db.transaction('kayitlar', 'readwrite');
        tx.objectStore('kayitlar').put(restoredAnimal);
        tx.oncomplete = loadData;
    });
};

window.openModal = function (src) {
    if (!src || src.endsWith('null') || src === "") return;
    const modal = document.getElementById("imageModal");
    const modalImg = document.getElementById("expandedImg");
    modal.style.display = "flex";
    modalImg.src = src;
};

window.closeModal = function () {
    document.getElementById("imageModal").style.display = "none";
};

window.exportJSON = function () {
    showLoading("Yedek alınıyor, lütfen bekleyiniz...");
    setTimeout(() => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allData));
        const today = new Date().toISOString().split('T')[0];
        const todayTime = new Date().toISOString().split('T')[1].split('.')[0];
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `Ciftlik_Yedek_${today}_${todayTime}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();

        hideLoading();
        Swal.fire({ title: 'Yedek Alındı!', text: 'Yedek başarıyla alındı ve cihazınıza indirildi.', icon: 'success', confirmButtonText: 'Kapat' });
    }, 100);
};

window.importJSON = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    Swal.fire({
        title: 'DİKKAT!', text: "Yedek yüklediğinizde mevcut tüm verileriniz SİLİNECEK. Onaylıyor musunuz?", icon: 'warning',
        showCancelButton: true, confirmButtonColor: '#ffc107', confirmButtonText: 'Evet, Yükle!', cancelButtonText: 'İptal'
    }).then((result) => {
        if (result.isConfirmed) {
            showLoading("Yedek yükleniyor...");
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const data = JSON.parse(e.target.result);
                    const tx = db.transaction("kayitlar", "readwrite");
                    const store = tx.objectStore("kayitlar");
                    store.clear();
                    data.forEach(item => store.put(item));
                    tx.oncomplete = () => {
                        hideLoading();
                        Swal.fire({ title: 'Tamamlandı!', text: 'Yedek başarıyla yüklendi.', icon: 'success', confirmButtonText: 'Kapat' });
                        loadData();
                    };
                } catch (err) {
                    hideLoading();
                    Swal.fire({ title: 'Hata!', text: 'Geçersiz yedek dosyası!', icon: 'error', confirmButtonText: 'Kapat' });
                }
            };
            reader.readAsText(file);
        } else {
            event.target.value = '';
        }
    });
};

let peer = null;
let html5QrCode = null;
let isScanning = false;

function resetPeerState() {
    document.getElementById('qrcode-container').innerHTML = "";
    document.getElementById('peer-status').style.display = 'none';
    if (peer) { peer.destroy(); peer = null; }
    const btn = document.getElementById('btnReceiveQR');
    if (btn) { btn.innerText = "Alıcı Karekodu Oluştur"; btn.style.background = ""; }
}

function resetScannerState() {
    if (isScanning && html5QrCode) {
        html5QrCode.stop().then(() => {
            isScanning = false;
            html5QrCode.clear();
            hideScannerUI();
        }).catch(err => {
            console.log("Kamera durdurulurken hata: ", err);
            isScanning = false;
            hideScannerUI();
        });
    } else {
        hideScannerUI();
    }
}

function hideScannerUI() {
    document.getElementById('reader').style.display = 'none';
    const btn = document.getElementById('btnScanQR');
    if (btn) { btn.innerText = "Kamerayı Aç ve Okut"; btn.style.background = "#6f42c1"; }
}

window.toggleReceiveQR = function () {
    const btn = document.getElementById('btnReceiveQR');
    if (btn.innerText === "Kapat") { resetPeerState(); return; }
    resetPeerState();
    peer = new Peer();

    peer.on('open', function (id) {
        new QRCode(document.getElementById("qrcode-container"), id);
        document.getElementById('peer-status').style.display = 'block';
        document.getElementById('peer-status').innerText = 'Bağlantı bekleniyor... (Uygulamayı kapatmayın)';
        btn.innerText = "Kapat";
        btn.style.background = "#dc3545";
    });

    peer.on('connection', function (conn) {
        let incomingData = [];
        let expectedTotal = 0;
        conn.on('data', function (msg) {
            if (msg.type === 'START') {
                incomingData = [];
                expectedTotal = msg.total;
                showLoading(`Bağlantı kuruldu. 0 / ${expectedTotal} hayvan indiriliyor...`);
                conn.send({ type: 'READY' });
            }
            else if (msg.type === 'CHUNK') {
                incomingData.push(msg.data);
                showLoading(`İndiriliyor: ${incomingData.length} / ${expectedTotal} hayvan tamamlandı...`);
                conn.send({ type: 'ACK' });
            }
            else if (msg.type === 'END') {
                hideLoading();
                Swal.fire({
                    title: 'Veri Aktarımı Tamamlandı',
                    text: `Karşı cihazdan ${incomingData.length} hayvan kaydı başarıyla indirildi! Mevcut veriler silinip yenileri eklenecek. Onaylıyor musunuz?`,
                    icon: 'question', showCancelButton: true, confirmButtonText: 'Evet, Yükle', cancelButtonText: 'İptal', confirmButtonColor: '#28a745'
                }).then((result) => {
                    if (result.isConfirmed) {
                        showLoading("Veriler veritabanına işleniyor...");
                        setTimeout(() => {
                            const tx = db.transaction("kayitlar", "readwrite");
                            const store = tx.objectStore("kayitlar");
                            store.clear();
                            incomingData.forEach(item => store.put(item));
                            tx.oncomplete = () => {
                                hideLoading();
                                Swal.fire({ title: 'Başarılı!', text: 'Veriler başarıyla aktarıldı!', icon: 'success', confirmButtonText: 'Tamam' });
                                loadData(); resetPeerState();
                            };
                            tx.onerror = () => {
                                hideLoading();
                                Swal.fire({ title: 'Hata!', text: 'Veritabanına yazılırken bir hata oluştu!', icon: 'error', confirmButtonText: 'Tamam' });
                                resetPeerState();
                            }
                        }, 100);
                    } else { resetPeerState(); }
                });
            }
        });
        conn.on('error', function (err) {
            hideLoading();
            Swal.fire({ title: 'Hata!', text: 'Veri aktarımı sırasında bağlantı koptu veya hata oluştu.', icon: 'error', confirmButtonText: 'Tamam' });
            resetPeerState();
        });
    });
};

function showLoading(text) {
    if (text) document.getElementById('loadingText').innerText = text;
    document.getElementById('loadingOverlay').style.display = 'flex';
}
function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

window.toggleQRScanner = function () {
    const btn = document.getElementById('btnScanQR');
    if (btn.innerText === "Kapat" || isScanning) { resetScannerState(); return; }
    document.getElementById('reader').style.display = 'block';

    if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");

    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText, decodedResult) => { resetScannerState(); sendDataToPeer(decodedText); },
        (errorMessage) => { }
    ).then(() => {
        isScanning = true;
        btn.innerText = "Kapat"; btn.style.background = "#dc3545";
    }).catch((err) => {
        Swal.fire('Hata!', 'Kamera başlatılamadı: ' + err, 'error');
        resetScannerState();
    });
};

function sendDataToPeer(targetPeerId) {
    if (!peer || peer.destroyed) peer = new Peer();

    const connectAndSend = () => {
        showLoading("Alıcı cihaza bağlanılıyor...");
        setTimeout(() => {
            const tx = db.transaction("kayitlar", "readonly");
            const request = tx.objectStore("kayitlar").getAll();
            request.onsuccess = () => {
                const allData = request.result;
                const conn = peer.connect(targetPeerId);
                let currentIndex = 0; 
                conn.on('open', function () { conn.send({ type: 'START', total: allData.length }); });
                conn.on('data', function (msg) {
                    if (msg.type === 'READY' || msg.type === 'ACK') {
                        if (currentIndex < allData.length) {
                            showLoading(`Gönderiliyor: ${currentIndex + 1} / ${allData.length} hayvan...`);
                            conn.send({ type: 'CHUNK', data: allData[currentIndex] });
                            currentIndex++; 
                        } else {
                            conn.send({ type: 'END' });
                            hideLoading();
                            Swal.fire({ title: 'Başarılı!', text: 'Tüm veriler karşı cihaza başarıyla gönderildi.', icon: 'success', confirmButtonText: 'Tamam' });
                            setTimeout(() => resetPeerState(), 500);
                        }
                    }
                });
                conn.on('error', function (err) {
                    hideLoading();
                    Swal.fire({ title: 'Hata!', text: 'Gönderim hatası: Bağlantı kurulamadı.', icon: 'error', confirmButtonText: 'Tamam' });
                    resetPeerState();
                });
            };
        }, 100);
    };

    if (peer.open) connectAndSend(); else peer.on('open', () => connectAndSend());
}

let updatePromptShown = false;
let updateAccepted = false; // Bunu false olarak başlattık

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            console.log('Service Worker başarıyla kaydedildi.', reg);
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (!updatePromptShown && newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        updatePromptShown = true;
                        Swal.fire({
                            title: 'Yeni Sürüm Mevcut!', 
                            text: '🚀 Uygulamanın yeni bir sürümü yayınlandı! Şimdi güncellemek ister misiniz?',
                            icon: 'info', 
                            showCancelButton: false, 
                            allowOutsideClick: false, 
                            allowEscapeKey: false,
                            confirmButtonText: 'Evet, Güncelle', 
                            confirmButtonColor: '#28a745', 
                            cancelButtonColor: '#6c757d',
                            didClose: () => { updatePromptShown = false; }
                        }).then((result) => {
                            if (result.isConfirmed) {
                                // SADECE KONTROLÜ AL MESAJI GÖNDERİYORUZ
                                updateAccepted = true;
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                                // BURADAN RELOAD VE REFRESHING KODLARINI SİLDİK
                            }
                        });
                    }
                });
            });
        }).catch(err => console.log('Service worker hatası', err));

        let refreshing = false;
        // SERVICE WORKER KONTROLÜ GERÇEKTEN ALDIĞINDA SAYFAYI YENİLE
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing && updateAccepted) { 
                refreshing = true; 
                window.location.reload(); 
            }
        });
    });
}

document.addEventListener('click', function (event) {
    const passwordInput = document.getElementById('appPassword');
    const loginScreen = document.getElementById('loginScreen');
    if (loginScreen.style.display !== 'none' && event.target !== passwordInput && event.target.tagName !== 'BUTTON') {
        passwordInput.focus();
    }
});

window.applyFilter = function () {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const filterCinsiyet = document.getElementById('filterCinsiyet').value;
    const filterIrk = document.getElementById('filterIrk').value;
    const filterHerdStatus = document.getElementById('filterHerdStatus').value;
    const filterMilking = document.getElementById('filterMilking').value;
    
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    filteredData = allData.filter(row => {
        const kupe = (row.kupeNo || "").toLowerCase();
        const lakap = (row.hayvanLakabi || "").toLowerCase();
        const matchesSearch = kupe.includes(searchTerm) || lakap.includes(searchTerm);
        const matchesCinsiyet = filterCinsiyet === "" || row.cinsiyet === filterCinsiyet;
        const matchesIrk = filterIrk === "" || row.hayvanCinsi === filterIrk;
        const isActive = !row.herdStatus || row.herdStatus === 'active';
        const matchesHerdStatus = filterHerdStatus === 'all' ||
            (filterHerdStatus === 'active' && isActive) ||
            (filterHerdStatus === 'exited' && !isActive);
        const milking = isAnimalMilking(row);
        const matchesMilking = filterMilking === '' ||
            (filterMilking === 'milking' && milking) ||
            (filterMilking === 'non-milking' && !milking);

        let matchesDate = true;
        if (startDate || endDate) {
            if (!row.dogumTarihi) {
                matchesDate = false;
            } else {
                if (startDate && row.dogumTarihi < startDate) matchesDate = false;
                if (endDate && row.dogumTarihi > endDate) matchesDate = false;
            }
        }

        return matchesSearch && matchesCinsiyet && matchesIrk && matchesDate && matchesHerdStatus && matchesMilking;
    });
    
    const totalCountEl = document.getElementById('totalCount');
    const activeCount = allData.filter(row => !row.herdStatus || row.herdStatus === 'active').length;
    totalCountEl.innerText = `Sürüde: ${activeCount} | Gösterilen: ${filteredData.length}`;
    
    isListDirty = false;
    renderTable();
};

window.clearSearch = function () {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterCinsiyet').value = '';
    document.getElementById('filterIrk').value = '';
    document.getElementById('filterHerdStatus').value = 'active';
    document.getElementById('filterMilking').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    
    applyFilter();
    
    document.getElementById('searchInput').focus();
};




/* --- PWA CİHAZA YÜKLEME (INSTALL) İŞLEMLERİ (ÇEREZ KONTROLLÜ) --- */

// Çerez (Cookie) Oluşturma Fonksiyonu
function setCookie(name, value, days) {
    let expires = "";
    if (days) {
        let date = new Date();
        // Belirtilen gün sayısı kadar süreyi milisaniye cinsinden ekle
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

// Çerez (Cookie) Okuma Fonksiyonu
function getCookie(name) {
    let nameEQ = name + "=";
    let ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

let deferredPrompt;

// 1. Android ve Masaüstü cihazlar için
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;

    // LocalStorage yerine Cookie kontrolü yapıyoruz
    if (!getCookie('installPromptShown')) {
        setTimeout(showInstallModal, 2500);
    }
});

// 2. iOS (iPhone/iPad) cihazlar için
function checkIOSInstall() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;

    // LocalStorage yerine Cookie kontrolü yapıyoruz
    if (isIOS && !isStandalone && !getCookie('installPromptShown')) {
        setTimeout(() => {
            document.getElementById('installMessage').innerHTML = 'Apple politikaları gereği uygulamamızı yüklemek için:<br><br><b>1.</b> Tarayıcınızın alt kısmındaki <b>Paylaş</b> <span style="font-size:1.2rem">⍐</span> ikonuna dokunun.<br><b>2.</b> Açılan menüden <b>Ana Ekrana Ekle</b> (Add to Home Screen) seçeneğini seçin.';
            document.getElementById('installBtn').style.display = 'none';
            showInstallModal();
        }, 2500);
    }
}

// 3. Modalı Göster
function showInstallModal() {
    document.getElementById('installModal').style.display = 'flex';
}

// 4. Modalı Kapat ve Çereze (Cookie) Kaydet
window.closeInstallModal = function() {
    document.getElementById('installModal').style.display = 'none';
    
    // "installPromptShown" çerezini "true" değeriyle 1 GÜNLÜK (1) oluştur.
    // Eğer 3 gün sormasın isterseniz buradaki 1 değerini 3 yapabilirsiniz.
    setCookie('installPromptShown', 'true', 1);
};

// 5. Yükle Butonuna Basılma Olayı (Android & Masaüstü)
window.installApp = async function() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('Kullanıcı uygulamayı yüklemeyi kabul etti.');
        }
        deferredPrompt = null;
    }
    closeInstallModal();
};

// Sayfa yüklendiğinde iOS kontrolünü başlat
window.addEventListener('load', () => {
    checkIOSInstall();
});

// İki parmakla yakınlaştırmayı (pinch-to-zoom) engelle
document.addEventListener('touchmove', (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
    document.addEventListener(eventName, (e) => {
        e.preventDefault();
    }, { passive: false });
});