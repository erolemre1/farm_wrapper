const hashed_data = "96a8f45187e9360673b36d3b6fa2dedccae4a05522241b80e8632a41ef4d1be2";

const viewRoutes = {
    homeView: 'home',
    addView: 'add-animal',
    listView: 'animals',
    detailView: 'animal-detail',
    milkView: 'milk',
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
let bulkMilkDate = null;
let milkChartRange = 7;
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

    // 5. İlgili ekran açıldığında verileri/kartları yükle
    if (viewId === 'homeView') {
        if (isDataLoaded) {
            renderHomeHerdStats();
            renderHomeMilkSummary();
            renderHomeReproductionAlerts();
            renderHomeHealthAlerts();
        }
    } else if (viewId === 'syncView') {
        const monthInput = document.getElementById('exportMilkMonth');
        if (monthInput && !monthInput.value) {
            monthInput.value = getTodayDateString().slice(0, 7);
        }
    } else if (viewId === 'listView') {
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
    } else if (viewId === 'milkView') {
        if (!isDataLoaded) {
            const milkContainer = document.getElementById('milkDashboardContainer');
            if (milkContainer) {
                milkContainer.innerHTML = `<div class="card" style="text-align: center; color: #666; font-style: italic;">Süt verileri yükleniyor...</div>`;
            }
            if (db && !isDataLoading) {
                loadData();
            }
        } else {
            renderMilkView();
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
        milkRecords: [],
        healthRecords: []
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
            data.healthRecords = Array.isArray(existingRecord.healthRecords) ? existingRecord.healthRecords : [];
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

function formatShortDateTR(dateStr) {
    if (!dateStr) return '';
    const parts = String(dateStr).split('-');
    if (parts.length === 3) return `${parts[2]}.${parts[1]}`;
    return dateStr;
}

function addDaysToDateStr(dateStr, deltaDays) {
    const parts = String(dateStr || getTodayDateString()).split('-').map(Number);
    const dt = new Date(parts[0], (parts[1] || 1) - 1, (parts[2] || 1) + deltaDays);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function getRecentDateRange(days) {
    const today = getTodayDateString();
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
        dates.push(addDaysToDateStr(today, -i));
    }
    return dates;
}

function formatLiters(value) {
    const num = Number(value) || 0;
    return num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function isAnimalMilking(row) {
    return Boolean(row && row.cinsiyet === 'Dişi' && row.isMilking);
}

function getActiveMilkingAnimals() {
    return allData.filter(row => (!row.herdStatus || row.herdStatus === 'active') && isAnimalMilking(row));
}

const GESTATION_DAYS = 283;
const DRY_OFF_BEFORE_CALVING_DAYS = 60;

function diffDaysBetweenDateStr(fromDateStr, toDateStr) {
    if (!fromDateStr || !toDateStr) return null;
    const f = String(fromDateStr).split('-').map(Number);
    const t = String(toDateStr).split('-').map(Number);
    if (f.length !== 3 || t.length !== 3) return null;
    const fromUtc = Date.UTC(f[0], f[1] - 1, f[2]);
    const toUtc = Date.UTC(t[0], t[1] - 1, t[2]);
    return Math.round((toUtc - fromUtc) / 86400000);
}

function normalizeKupeNo(val) {
    return String(val ?? '').trim();
}

function getPregnancyInfo(animal) {
    if (!animal || animal.cinsiyet !== 'Dişi' || !animal.kogustuguTarih) return null;
    const breedingDate = animal.kogustuguTarih;
    const estimatedCalvingDate = addDaysToDateStr(breedingDate, GESTATION_DAYS);
    const dryOffDate = addDaysToDateStr(estimatedCalvingDate, -DRY_OFF_BEFORE_CALVING_DAYS);
    const today = getTodayDateString();
    const daysSinceBreeding = diffDaysBetweenDateStr(breedingDate, today);
    const daysUntilCalving = diffDaysBetweenDateStr(today, estimatedCalvingDate);
    const daysUntilDryOff = diffDaysBetweenDateStr(today, dryOffDate);

    if (daysSinceBreeding === null || daysUntilCalving === null || daysUntilDryOff === null) return null;

    const isStale = daysSinceBreeding > 315 || daysSinceBreeding < 0;
    const isDueSoon = !isStale && daysUntilCalving <= 30 && daysUntilCalving >= -14;
    const isDryOffDue = !isStale && daysUntilDryOff <= 7 && daysUntilCalving > 0;
    const isInDryOffPeriod = !isStale && daysUntilDryOff <= 0 && daysUntilCalving > 0;
    const progressPercent = Math.max(0, Math.min(100, Math.round((daysSinceBreeding / GESTATION_DAYS) * 100)));

    let countdownText = '';
    if (daysUntilCalving > 0) countdownText = `${daysUntilCalving} gün kaldı`;
    else if (daysUntilCalving === 0) countdownText = 'Doğum bugün!';
    else countdownText = `${Math.abs(daysUntilCalving)} gün geçti`;

    return {
        breedingDate,
        estimatedCalvingDate,
        dryOffDate,
        daysSinceBreeding,
        daysUntilCalving,
        daysUntilDryOff,
        isStale,
        isDueSoon,
        isDryOffDue,
        isInDryOffPeriod,
        progressPercent,
        countdownText
    };
}

function findMotherAnimal(animal) {
    const motherKupe = normalizeKupeNo(animal?.anneKupeNo);
    if (!motherKupe) return null;
    return allData.find(row => row.id !== animal.id && normalizeKupeNo(row.kupeNo) === motherKupe) || null;
}

function findOffspringAnimals(animal) {
    const ownKupe = normalizeKupeNo(animal?.kupeNo);
    if (!ownKupe) return [];
    return allData
        .filter(row => row.id !== animal.id && normalizeKupeNo(row.anneKupeNo) === ownKupe)
        .sort((a, b) => String(b.dogumTarihi || '').localeCompare(String(a.dogumTarihi || '')));
}

const HEALTH_TYPE_META = {
    vaccine: { label: '💉 Aşı', badgeClass: 'health-type-vaccine' },
    parasite: { label: '🐛 Parazit İlacı', badgeClass: 'health-type-parasite' },
    treatment: { label: '💊 Tedavi / İlaç', badgeClass: 'health-type-treatment' },
    vet: { label: '🩺 Veteriner', badgeClass: 'health-type-vet' },
    other: { label: '📝 Diğer', badgeClass: 'health-type-other' }
};

function getHealthRecords(row) {
    if (!row || !Array.isArray(row.healthRecords)) return [];
    return [...row.healthRecords].sort((a, b) => {
        const cmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (cmp !== 0) return cmp;
        return String(b.id || '').localeCompare(String(a.id || ''));
    });
}

function getPendingHealthRemindersForAnimal(animal, maxDaysAhead = 30) {
    const records = getHealthRecords(animal);
    if (!records.length) return [];
    const today = getTodayDateString();
    const reminders = [];

    records.forEach(rec => {
        if (!rec.nextDate) return;
        const daysUntil = diffDaysBetweenDateStr(today, rec.nextDate);
        if (daysUntil === null || daysUntil > maxDaysAhead || daysUntil < -60) return;

        // Aynı başlıkla sonraki tarihte veya sonrasında yeni kayıt girildiyse hatırlatma tamamlanmıştır
        const normTitle = String(rec.title || '').trim().toLowerCase();
        const fulfilled = normTitle && records.some(other =>
            other.id !== rec.id &&
            String(other.title || '').trim().toLowerCase() === normTitle &&
            other.date &&
            other.date >= rec.nextDate
        );
        if (fulfilled) return;

        reminders.push({ record: rec, daysUntil });
    });

    return reminders.sort((a, b) => a.daysUntil - b.daysUntil);
}

function formatHealthCountdown(daysUntil) {
    if (daysUntil > 0) return `${daysUntil} gün kaldı`;
    if (daysUntil === 0) return 'Bugün!';
    return `${Math.abs(daysUntil)} gün gecikti`;
}

function getMilkRecords(row) {
    if (!row || !Array.isArray(row.milkRecords)) return [];
    return [...row.milkRecords].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

function calculateAgeInfo(birthDateStr) {
    if (!birthDateStr) return null;
    const parts = String(birthDateStr).split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = now.getMonth() + 1;
    const todayD = now.getDate();

    const birthY = parts[0];
    const birthM = parts[1];
    const birthD = parts[2];

    const birthDate = new Date(birthY, birthM - 1, birthD);
    const todayDate = new Date(todayY, todayM - 1, todayD);
    if (birthDate > todayDate) {
        return { totalMonths: 0, years: 0, months: 0, days: 0, label: 'Gelecek tarih' };
    }

    let years = todayY - birthY;
    let months = todayM - birthM;
    let days = todayD - birthD;

    if (days < 0) {
        const prevMonthLastDay = new Date(todayY, todayM - 1, 0).getDate();
        days += prevMonthLastDay;
        months -= 1;
    }
    if (months < 0) {
        months += 12;
        years -= 1;
    }

    const totalMonths = years * 12 + months;
    let label = '';
    if (totalMonths === 0) {
        label = days === 0 ? 'Yeni doğan' : `${days} günlük`;
    } else if (years === 0) {
        label = `${months} aylık`;
    } else if (months === 0) {
        label = `${years} yaş`;
    } else {
        label = `${years} yıl ${months} ay`;
    }

    return { totalMonths, years, months, days, label };
}

function getAnimalAgeGroup(animal) {
    const age = calculateAgeInfo(animal?.dogumTarihi);
    if (!age) return 'unknown';
    if (age.totalMonths < 6) return 'calf';
    if (animal.cinsiyet === 'Erkek') return 'maleYoungOrAdult';
    if (animal.cinsiyet === 'Dişi') {
        const hasCalved = findOffspringAnimals(animal).length > 0;
        if (age.totalMonths < 24 && !isAnimalMilking(animal) && !hasCalved) {
            return 'heifer';
        }
        return 'cow';
    }
    return 'unknown';
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
        renderHomeHerdStats();
        renderHomeMilkSummary();
        renderHomeReproductionAlerts();
        renderHomeHealthAlerts();
        if (currentView === 'listView') {
            applyFilter();
        } else if (currentView === 'detailView') {
            renderAnimalDetail(selectedAnimalId);
        } else if (currentView === 'milkView') {
            renderMilkView();
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
        const pregnancyInfo = isActive ? getPregnancyInfo(row) : null;
        const calvingBadgeHtml = pregnancyInfo && pregnancyInfo.isDueSoon
            ? `<span class="card-badge-calving">🤰 ${pregnancyInfo.countdownText}</span>`
            : '';
        const urgentHealth = isActive ? getPendingHealthRemindersForAnimal(row, 14)[0] : null;
        const healthBadgeHtml = urgentHealth
            ? `<span class="card-badge-health">💉 ${formatHealthCountdown(urgentHealth.daysUntil)}</span>`
            : '';
        const calvingRowHtml = pregnancyInfo && !pregnancyInfo.isStale
            ? `<div class="card-info-row"><strong>Tahmini Doğum:</strong> <span>${formatDateTR(pregnancyInfo.estimatedCalvingDate)} (${pregnancyInfo.countdownText})</span></div>`
            : '';
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
                        ${calvingBadgeHtml}
                        ${healthBadgeHtml}
                        ${milking ? '<span class="card-badge-milking">🥛 Sağılır</span>' : ''}
                        <span class="card-badge">#${index + 1}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="card-info-row"><strong>Lakap:</strong> <span>${escapeHtml(row.hayvanLakabi || '-')}</span></div>
                    <div class="card-info-row"><strong>Cinsiyet:</strong> <span>${escapeHtml(row.cinsiyet)}</span></div>
                    <div class="card-info-row"><strong>Irk:</strong> <span>${escapeHtml(row.hayvanCinsi)}</span></div>
                    <div class="card-info-row"><strong>Doğum Tarihi:</strong> <span>${formatDateTR(row.dogumTarihi)}</span></div>
                    <div class="card-info-row"><strong>Yaş:</strong> <span>${calculateAgeInfo(row.dogumTarihi)?.label || '-'}</span></div>
                    <div class="card-info-row"><strong>Koğuştuğu Tarih:</strong> <span>${formatDateTR(row.kogustuguTarih)}</span></div>
                    ${calvingRowHtml}
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

                ${records.length > 0 ? (() => {
                    const chartSeries = records.slice(0, 14).reverse().map(r => {
                        const m = Number(r.morning) || 0;
                        const e = Number(r.evening) || 0;
                        return { date: r.date, morning: m, evening: e, total: m + e, cowCount: 1 };
                    });
                    return `
                        <h4 class="milk-history-title">Süt Verimi Grafiği (Son ${chartSeries.length} Kayıt)</h4>
                        <div class="milk-chart-legend">
                            <span><i class="legend-dot legend-morning"></i>Sabah Sütü</span>
                            <span><i class="legend-dot legend-evening"></i>Akşam Sütü</span>
                        </div>
                        <div class="milk-chart-wrapper">${buildMilkBarChartSvg(chartSeries, 'detailMilkChartTooltip', false)}</div>
                        <div id="detailMilkChartTooltip" class="milk-chart-tooltip">Günlük sabah/akşam detayını görmek için grafikteki çubuklara dokunun.</div>
                    `;
                })() : ''}

                <h4 class="milk-history-title">Süt Geçmişi</h4>
                ${historyHtml}
            </div>
        `;
    }

    const pregnancyInfo = getPregnancyInfo(animal);
    let reproductionSectionHtml = '';
    if (isFemale) {
        let reproBodyHtml = '';
        if (!pregnancyInfo) {
            reproBodyHtml = '<div class="repro-banner repro-banner-info">Koğuşma / tohumlama tarihi girildiğinde tahmini doğum (~283 gün) ve kuruya çekme (~60 gün önce) tarihleri otomatik hesaplanır.</div>';
        } else if (pregnancyInfo.isStale) {
            reproBodyHtml = `<div class="repro-banner repro-banner-info">Kayıtlı koğuşma tarihinden (${formatDateTR(pregnancyInfo.breedingDate)}) ${pregnancyInfo.daysSinceBreeding < 0 ? 'ileri bir tarih girilmiş' : `${pregnancyInfo.daysSinceBreeding} gün geçmiş`}. Yeni koğuşma/tohumlama tarihi girebilir veya mevcut tarihi temizleyebilirsiniz.</div>`;
        } else {
            const pillClass = pregnancyInfo.daysUntilCalving <= 7
                ? 'repro-pill-urgent'
                : (pregnancyInfo.isDueSoon ? 'repro-pill-soon' : (pregnancyInfo.isInDryOffPeriod ? 'repro-pill-dryoff' : 'repro-pill-normal'));
            const dryOffBannerHtml = pregnancyInfo.isInDryOffPeriod && milking
                ? `
                    <div class="repro-banner repro-banner-dryoff">
                        <span>🛑 <strong>Kuruya çekme dönemi geldi!</strong> (${formatDateTR(pregnancyInfo.dryOffDate)}) Bu inek hâlâ sağılır görünüyor.</span>
                        <button type="button" class="btn-warning" onclick="toggleAnimalMilking(${animal.id}, false)">Kuruya Çek (Sağımı Kapat)</button>
                    </div>
                `
                : '';

            reproBodyHtml = `
                ${dryOffBannerHtml}
                <div class="repro-progress-wrap">
                    <div class="repro-progress-meta">
                        <span>Gebelik: <strong>${pregnancyInfo.daysSinceBreeding}. gün</strong> / ${GESTATION_DAYS} gün (%${pregnancyInfo.progressPercent})</span>
                        <span class="repro-pill ${pillClass}">${pregnancyInfo.countdownText}</span>
                    </div>
                    <div class="repro-progress-track">
                        <div class="repro-progress-fill ${pregnancyInfo.isDueSoon ? 'near-due' : ''}" style="width: ${pregnancyInfo.progressPercent}%"></div>
                    </div>
                </div>
                <div class="detail-info-grid" style="margin-bottom: 1rem;">
                    <div class="detail-info-item">
                        <span class="detail-info-label">Koğuştuğu / Tohumlama</span>
                        <span class="detail-info-value">${formatDateTR(pregnancyInfo.breedingDate)}</span>
                    </div>
                    <div class="detail-info-item">
                        <span class="detail-info-label">Kuruya Çekme Tarihi (-60 gün)</span>
                        <span class="detail-info-value">${formatDateTR(pregnancyInfo.dryOffDate)}</span>
                    </div>
                    <div class="detail-info-item">
                        <span class="detail-info-label">Tahmini Doğum (+283 gün)</span>
                        <span class="detail-info-value">${formatDateTR(pregnancyInfo.estimatedCalvingDate)}</span>
                    </div>
                </div>
                <button type="button" class="btn-success" style="width: 100%; margin: 0;" onclick="startAddCalfForMother(${animal.id})">🐮 Doğum Yaptı — Buzağı Kaydı Ekle</button>
            `;
        }

        reproductionSectionHtml = `
            <div class="card">
                <div class="milk-section-header">
                    <h3>🤰 Üreme & Doğum Takibi</h3>
                </div>
                <form class="repro-form-row" onsubmit="saveBreedingDate(event, ${animal.id})">
                    <div class="form-group">
                        <label for="detailBreedingDate">Koğuştuğu / Tohumlama Tarihi</label>
                        <input type="date" id="detailBreedingDate" value="${animal.kogustuguTarih || ''}">
                    </div>
                    <button type="submit" class="btn-primary" style="width: auto;">Tarihi Kaydet</button>
                    ${animal.kogustuguTarih ? `<button type="button" class="btn-secondary" onclick="clearBreedingDate(${animal.id})">Temizle</button>` : ''}
                </form>
                ${reproBodyHtml}
            </div>
        `;
    }

    const motherAnimal = findMotherAnimal(animal);
    const offspringList = findOffspringAnimals(animal);
    const motherHtml = motherAnimal
        ? `
            <div class="pedigree-item clickable" onclick="openAnimalDetail(${motherAnimal.id})">
                <div>
                    <div class="pedigree-item-name">🐄 Küpe: ${escapeHtml(motherAnimal.kupeNo)}${motherAnimal.hayvanLakabi ? ` (${escapeHtml(motherAnimal.hayvanLakabi)})` : ''}</div>
                    <div class="pedigree-item-sub">${escapeHtml(motherAnimal.hayvanCinsi || '-')} · Doğum: ${formatDateTR(motherAnimal.dogumTarihi)}</div>
                </div>
                <span class="pedigree-arrow">Profili Gör →</span>
            </div>
        `
        : (animal.anneKupeNo
            ? `<div class="pedigree-item"><div><div class="pedigree-item-name" style="color: #444;">Küpe: ${escapeHtml(animal.anneKupeNo)}</div><div class="pedigree-item-sub">Sürüde kayıtlı değil${animal.anneCinsi ? ` · Irk: ${escapeHtml(animal.anneCinsi)}` : ''}</div></div></div>`
            : '<div class="milk-empty-state" style="padding: 0.9rem;">Anne küpe numarası girilmemiş.</div>');

    const showOffspringBlock = isFemale || offspringList.length > 0;
    const offspringBlockHtml = showOffspringBlock
        ? `
            <div class="pedigree-block">
                <div class="pedigree-block-header">
                    <h4>🐮 Yavruları (${offspringList.length})</h4>
                    ${isFemale ? `<button type="button" class="pedigree-add-calf-btn" onclick="startAddCalfForMother(${animal.id})">+ Buzağı Ekle</button>` : ''}
                </div>
                ${offspringList.length === 0
                    ? '<div class="milk-empty-state" style="padding: 0.9rem;">Henüz bu hayvana bağlı kayıtlı yavru bulunmuyor.</div>'
                    : `<div class="pedigree-list">${offspringList.map(child => {
                        const childActive = !child.herdStatus || child.herdStatus === 'active';
                        const genderIcon = child.cinsiyet === 'Erkek' ? '♂️' : (child.cinsiyet === 'Dişi' ? '♀️' : '');
                        return `
                            <div class="pedigree-item clickable" onclick="openAnimalDetail(${child.id})">
                                <div>
                                    <div class="pedigree-item-name">${genderIcon} Küpe: ${escapeHtml(child.kupeNo)}${child.hayvanLakabi ? ` (${escapeHtml(child.hayvanLakabi)})` : ''}</div>
                                    <div class="pedigree-item-sub">${escapeHtml(child.cinsiyet || '-')} · ${escapeHtml(child.hayvanCinsi || '-')} · Doğum: ${formatDateTR(child.dogumTarihi)}${!childActive ? ` · ${escapeHtml(exitLabels[child.herdStatus] || 'Sürüden çıktı')}` : ''}</div>
                                </div>
                                <span class="pedigree-arrow">Detay →</span>
                            </div>
                        `;
                    }).join('')}</div>`
                }
            </div>
        `
        : '';

    const pedigreeSectionHtml = `
        <div class="card">
            <div class="milk-section-header">
                <h3>🧬 Soy Ağacı (Anne & Yavrular)</h3>
            </div>
            <div class="pedigree-block">
                <div class="pedigree-block-header">
                    <h4>Annesi</h4>
                </div>
                ${motherHtml}
            </div>
            ${offspringBlockHtml}
        </div>
    `;

    const healthRecords = getHealthRecords(animal);
    const pendingHealthReminders = getPendingHealthRemindersForAnimal(animal, 365);
    const nextHealthReminder = pendingHealthReminders[0] || null;
    const totalHealthCost = healthRecords.reduce((sum, r) => sum + (Number(r.cost) || 0), 0);
    const todayForHealth = getTodayDateString();

    const healthHistoryHtml = healthRecords.length === 0
        ? '<div class="milk-empty-state">Henüz aşı, tedavi veya veteriner kaydı eklenmedi.</div>'
        : `<div class="health-history-list">${healthRecords.map(rec => {
            const meta = HEALTH_TYPE_META[rec.type] || HEALTH_TYPE_META.other;
            const costNum = Number(rec.cost) || 0;
            let nextBadgeHtml = '';
            if (rec.nextDate) {
                const daysUntil = diffDaysBetweenDateStr(todayForHealth, rec.nextDate);
                const stateCls = daysUntil !== null && daysUntil < 0 ? 'overdue' : (daysUntil !== null && daysUntil <= 14 ? 'soon' : '');
                const countdownPart = daysUntil !== null ? ` (${formatHealthCountdown(daysUntil)})` : '';
                nextBadgeHtml = `<span class="health-next-badge ${stateCls}">🔔 Sonraki: ${formatDateTR(rec.nextDate)}${countdownPart}</span>`;
            }
            const safeRecId = escapeHtml(rec.id);
            return `
                <div class="health-history-item">
                    <div class="health-history-top">
                        <div class="health-history-title-wrap">
                            <span class="health-type-badge ${meta.badgeClass}">${meta.label}</span>
                            <span class="health-record-title">${escapeHtml(rec.title)}</span>
                        </div>
                        <div class="milk-history-actions">
                            <button type="button" class="btn-info" onclick="editHealthRecord(${animal.id}, '${safeRecId}')" title="Düzenle">✏️</button>
                            <button type="button" class="btn-danger" onclick="deleteHealthRecord(${animal.id}, '${safeRecId}')" title="Sil">🗑️</button>
                        </div>
                    </div>
                    <div class="health-record-meta">
                        <span>📅 ${formatDateTR(rec.date)}</span>
                        ${rec.medicine ? `<span>💊 İlaç: <strong>${escapeHtml(rec.medicine)}</strong></span>` : ''}
                        ${costNum > 0 ? `<span>💰 Maliyet: <strong>${costNum.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</strong></span>` : ''}
                    </div>
                    ${nextBadgeHtml}
                    ${rec.notes ? `<div class="health-record-notes">${escapeHtml(rec.notes)}</div>` : ''}
                </div>
            `;
        }).join('')}</div>`;

    const healthSectionHtml = `
        <div class="card">
            <div class="milk-section-header">
                <h3>💉 Sağlık, Aşı & Veteriner Kayıtları</h3>
            </div>

            <div class="health-presets">
                <button type="button" class="health-preset-chip" onclick="applyHealthPreset('vaccine', 'Şap Aşısı')">💉 Şap Aşısı</button>
                <button type="button" class="health-preset-chip" onclick="applyHealthPreset('vaccine', 'Brucella Aşısı')">💉 Brucella</button>
                <button type="button" class="health-preset-chip" onclick="applyHealthPreset('parasite', 'İç-Dış Parazit İlacı')">🐛 Parazit</button>
                <button type="button" class="health-preset-chip" onclick="applyHealthPreset('treatment', 'Mastitis Tedavisi')">💊 Mastitis</button>
                <button type="button" class="health-preset-chip" onclick="applyHealthPreset('treatment', 'Ayak / Tırnak Bakımı')">🦶 Ayak Bakımı</button>
                <button type="button" class="health-preset-chip" onclick="applyHealthPreset('vet', 'Veteriner Muayenesi')">🩺 Muayene</button>
            </div>

            <form id="healthEntryForm" onsubmit="saveHealthRecord(event, ${animal.id})">
                <input type="hidden" id="healthRecordEditId" value="">
                <div class="health-form-grid">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label for="healthType">İşlem Türü</label>
                        <select id="healthType" required>
                            <option value="vaccine">💉 Aşı</option>
                            <option value="parasite">🐛 Parazit İlacı</option>
                            <option value="treatment">💊 Tedavi / İlaç</option>
                            <option value="vet">🩺 Veteriner Muayenesi</option>
                            <option value="other">📝 Diğer</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label for="healthDate">İşlem Tarihi</label>
                        <input type="date" id="healthDate" value="${todayForHealth}" required>
                    </div>
                    <div class="form-group full-span" style="margin-bottom: 0;">
                        <label for="healthTitle">İşlem / Aşı Adı</label>
                        <input type="text" id="healthTitle" placeholder="Örn. Şap Aşısı, Mastitis Tedavisi" required>
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label for="healthMedicine">İlaç / Aşı Markası (İsteğe Bağlı)</label>
                        <input type="text" id="healthMedicine" placeholder="Örn. İvermektin, Antibiyotik">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label for="healthCost">Maliyet (TL - İsteğe Bağlı)</label>
                        <input type="number" id="healthCost" min="0" step="0.01" inputmode="decimal" placeholder="Örn. 750">
                    </div>
                    <div class="form-group full-span" style="margin-bottom: 0;">
                        <label for="healthNextDate">Sıradaki Aşı / Kontrol Tarihi (Hatırlatma İçin)</label>
                        <input type="date" id="healthNextDate">
                    </div>
                    <div class="form-group full-span" style="margin-bottom: 0;">
                        <label for="healthNotes">Veteriner Notu / Açıklama</label>
                        <input type="text" id="healthNotes" placeholder="Kısa not veya doz bilgisi...">
                    </div>
                </div>
                <div class="health-form-actions">
                    <button type="submit" id="healthSubmitBtn" class="btn-primary" style="flex: 1;">💾 Sağlık Kaydını Kaydet</button>
                    <button type="button" id="healthCancelEditBtn" class="btn-secondary" style="display: none;" onclick="resetHealthForm()">İptal</button>
                </div>
            </form>

            ${healthRecords.length > 0 ? `
                <div class="milk-stats-grid">
                    <div class="milk-stat-card">
                        <span class="milk-stat-label">Toplam İşlem</span>
                        <span class="milk-stat-value">${healthRecords.length}</span>
                    </div>
                    <div class="milk-stat-card">
                        <span class="milk-stat-label">Toplam Maliyet</span>
                        <span class="milk-stat-value">${totalHealthCost.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL</span>
                    </div>
                    <div class="milk-stat-card">
                        <span class="milk-stat-label">Sıradaki Hatırlatma</span>
                        <span class="milk-stat-value" style="font-size: 0.95rem;">${nextHealthReminder ? formatDateTR(nextHealthReminder.record.nextDate) : '-'}</span>
                        ${nextHealthReminder ? `<span class="home-milk-metric-sub">${escapeHtml(nextHealthReminder.record.title)} (${formatHealthCountdown(nextHealthReminder.daysUntil)})</span>` : ''}
                    </div>
                </div>
            ` : ''}

            <h4 class="milk-history-title">Sağlık & Aşı Geçmişi</h4>
            ${healthHistoryHtml}
        </div>
    `;

    container.innerHTML = `
        <div class="card">
            <div class="detail-header">
                <div>
                    <h2>Küpe: ${escapeHtml(animal.kupeNo)}</h2>
                    ${animal.hayvanLakabi ? `<p class="detail-subtitle">Lakap: ${escapeHtml(animal.hayvanLakabi)}</p>` : ''}
                </div>
                <div class="card-badges">
                    ${pregnancyInfo && pregnancyInfo.isDueSoon ? `<span class="card-badge-calving">🤰 ${pregnancyInfo.countdownText}</span>` : ''}
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
                    <span class="detail-info-label">Yaş</span>
                    <span class="detail-info-value">${calculateAgeInfo(animal.dogumTarihi)?.label || '-'}</span>
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
        ${reproductionSectionHtml}
        ${healthSectionHtml}
        ${pedigreeSectionHtml}
        ${milkSectionHtml}
    `;
}

function renderHomeHealthAlerts() {
    const container = document.getElementById('homeHealthAlerts');
    if (!container) return;

    const reminders = [];
    allData.forEach(animal => {
        const isActive = !animal.herdStatus || animal.herdStatus === 'active';
        if (!isActive) return;

        getPendingHealthRemindersForAnimal(animal, 30).forEach(item => {
            reminders.push({ animal, record: item.record, daysUntil: item.daysUntil });
        });
    });

    if (reminders.length === 0) {
        container.innerHTML = '';
        return;
    }

    reminders.sort((a, b) => a.daysUntil - b.daysUntil);

    container.innerHTML = `
        <div class="home-health-card">
            <h3 class="home-health-title">
                <span>💉 Yaklaşan Aşı & Sağlık Hatırlatmaları</span>
                <span class="repro-pill repro-pill-normal">${reminders.length} kayıt</span>
            </h3>
            <div class="repro-alert-list">
                ${reminders.map(({ animal, record, daysUntil }) => {
                    const isOverdue = daysUntil < 0;
                    const pillClass = isOverdue ? 'repro-pill-urgent' : (daysUntil <= 7 ? 'repro-pill-dryoff' : 'repro-pill-normal');
                    return `
                        <div class="health-alert-item ${isOverdue ? 'overdue' : ''}" onclick="openAnimalDetail(${animal.id})">
                            <div>
                                <div class="repro-alert-name">Küpe: ${escapeHtml(animal.kupeNo)}${animal.hayvanLakabi ? ` (${escapeHtml(animal.hayvanLakabi)})` : ''} — ${escapeHtml(record.title)}</div>
                                <div class="repro-alert-date">Planlanan Tarih: ${formatDateTR(record.nextDate)}</div>
                            </div>
                            <span class="repro-pill ${pillClass}">${formatHealthCountdown(daysUntil)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

window.applyHealthPreset = function (type, title) {
    const typeEl = document.getElementById('healthType');
    const titleEl = document.getElementById('healthTitle');
    if (typeEl) typeEl.value = type;
    if (titleEl) {
        titleEl.value = title;
        titleEl.focus();
    }
};

window.resetHealthForm = function () {
    const form = document.getElementById('healthEntryForm');
    if (form) form.reset();
    const editIdEl = document.getElementById('healthRecordEditId');
    const dateEl = document.getElementById('healthDate');
    const submitBtn = document.getElementById('healthSubmitBtn');
    const cancelBtn = document.getElementById('healthCancelEditBtn');
    if (editIdEl) editIdEl.value = '';
    if (dateEl) dateEl.value = getTodayDateString();
    if (submitBtn) submitBtn.innerText = '💾 Sağlık Kaydını Kaydet';
    if (cancelBtn) cancelBtn.style.display = 'none';
};

window.saveHealthRecord = function (event, animalId) {
    event.preventDefault();
    const animal = allDataById.get(Number(animalId));
    if (!animal) return;

    const editRecId = document.getElementById('healthRecordEditId')?.value || '';
    const type = document.getElementById('healthType')?.value || 'other';
    const date = document.getElementById('healthDate')?.value || '';
    const title = document.getElementById('healthTitle')?.value.trim() || '';
    const medicine = document.getElementById('healthMedicine')?.value.trim() || '';
    const rawCost = document.getElementById('healthCost')?.value.trim() || '';
    const nextDate = document.getElementById('healthNextDate')?.value || '';
    const notes = document.getElementById('healthNotes')?.value.trim() || '';

    if (!date || !title) {
        Swal.fire({ title: 'Uyarı', text: 'Lütfen tarih ve işlem/aşı adını girin.', icon: 'warning', confirmButtonText: 'Tamam' });
        return;
    }

    const cost = rawCost === '' ? 0 : Number(rawCost);
    if (!Number.isFinite(cost) || cost < 0) {
        Swal.fire({ title: 'Hata', text: 'Geçerli bir maliyet tutarı girin.', icon: 'error', confirmButtonText: 'Tamam' });
        return;
    }

    const recordObj = {
        id: editRecId || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date,
        type,
        title,
        medicine,
        cost,
        nextDate,
        notes
    };

    const existing = getHealthRecords(animal).filter(r => r.id !== recordObj.id);
    existing.push(recordObj);
    existing.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    const updatedAnimal = { ...animal, healthRecords: existing };
    updateAnimalRecordInDB(updatedAnimal, () => {
        renderAnimalDetail(updatedAnimal.id);
        Swal.fire({
            title: editRecId ? 'Güncellendi!' : 'Kaydedildi!',
            text: `${title} kaydı başarıyla işlendi.`,
            icon: 'success',
            timer: 1400,
            showConfirmButton: false
        });
    });
};

window.editHealthRecord = function (animalId, recordId) {
    const animal = allDataById.get(Number(animalId));
    if (!animal) return;
    const rec = getHealthRecords(animal).find(r => r.id === recordId);
    if (!rec) return;

    document.getElementById('healthRecordEditId').value = rec.id;
    document.getElementById('healthType').value = rec.type || 'other';
    document.getElementById('healthDate').value = rec.date || getTodayDateString();
    document.getElementById('healthTitle').value = rec.title || '';
    document.getElementById('healthMedicine').value = rec.medicine || '';
    document.getElementById('healthCost').value = rec.cost ? rec.cost : '';
    document.getElementById('healthNextDate').value = rec.nextDate || '';
    document.getElementById('healthNotes').value = rec.notes || '';
    document.getElementById('healthSubmitBtn').innerText = '💾 Kaydı Güncelle';
    document.getElementById('healthCancelEditBtn').style.display = 'inline-block';

    const formEl = document.getElementById('healthEntryForm');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.deleteHealthRecord = function (animalId, recordId) {
    const animal = allDataById.get(Number(animalId));
    if (!animal) return;
    const rec = getHealthRecords(animal).find(r => r.id === recordId);
    if (!rec) return;

    Swal.fire({
        title: 'Sağlık kaydını sil?',
        text: `${formatDateTR(rec.date)} - ${rec.title} kaydı silinecek.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Evet, Sil',
        cancelButtonText: 'İptal'
    }).then(result => {
        if (!result.isConfirmed) return;
        const remaining = getHealthRecords(animal).filter(r => r.id !== recordId);
        const updatedAnimal = { ...animal, healthRecords: remaining };
        updateAnimalRecordInDB(updatedAnimal, () => {
            renderAnimalDetail(updatedAnimal.id);
        });
    });
};

function renderHomeReproductionAlerts() {
    const container = document.getElementById('homeReproductionAlerts');
    if (!container) return;

    const upcomingBirths = [];
    const dryOffReminders = [];

    allData.forEach(animal => {
        const isActive = !animal.herdStatus || animal.herdStatus === 'active';
        if (!isActive || animal.cinsiyet !== 'Dişi') return;

        const info = getPregnancyInfo(animal);
        if (!info || info.isStale) return;

        if (info.isDueSoon) {
            upcomingBirths.push({ animal, info });
        }
        if (info.isDryOffDue && isAnimalMilking(animal)) {
            dryOffReminders.push({ animal, info });
        }
    });

    if (upcomingBirths.length === 0 && dryOffReminders.length === 0) {
        container.innerHTML = '';
        return;
    }

    upcomingBirths.sort((a, b) => a.info.daysUntilCalving - b.info.daysUntilCalving);
    dryOffReminders.sort((a, b) => a.info.daysUntilDryOff - b.info.daysUntilDryOff);

    const birthsHtml = upcomingBirths.length > 0
        ? `
            <div class="home-repro-section">
                <h3 class="home-repro-title">
                    <span>🤰 Yaklaşan Doğumlar (30 Gün)</span>
                    <span class="repro-pill repro-pill-soon">${upcomingBirths.length} inek</span>
                </h3>
                <div class="repro-alert-list">
                    ${upcomingBirths.map(({ animal, info }) => {
                        const pillClass = info.daysUntilCalving <= 7 ? 'repro-pill-urgent' : 'repro-pill-soon';
                        return `
                            <div class="repro-alert-item" onclick="openAnimalDetail(${animal.id})">
                                <div>
                                    <div class="repro-alert-name">Küpe: ${escapeHtml(animal.kupeNo)}${animal.hayvanLakabi ? ` (${escapeHtml(animal.hayvanLakabi)})` : ''}</div>
                                    <div class="repro-alert-date">Tahmini Doğum: ${formatDateTR(info.estimatedCalvingDate)}</div>
                                </div>
                                <span class="repro-pill ${pillClass}">${info.countdownText}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `
        : '';

    const dryOffHtml = dryOffReminders.length > 0
        ? `
            <div class="home-repro-section">
                <h3 class="home-repro-title dryoff-title">
                    <span>🛑 Kuruya Çekme Hatırlatması</span>
                    <span class="repro-pill repro-pill-dryoff">${dryOffReminders.length} inek</span>
                </h3>
                <div class="repro-alert-list">
                    ${dryOffReminders.map(({ animal, info }) => {
                        const dryLabel = info.daysUntilDryOff <= 0
                            ? 'Kuruya çekilmeli'
                            : `${info.daysUntilDryOff} gün kaldı`;
                        return `
                            <div class="repro-alert-item dryoff-item" onclick="openAnimalDetail(${animal.id})">
                                <div>
                                    <div class="repro-alert-name">Küpe: ${escapeHtml(animal.kupeNo)}${animal.hayvanLakabi ? ` (${escapeHtml(animal.hayvanLakabi)})` : ''}</div>
                                    <div class="repro-alert-date">Kuruya Çekme: ${formatDateTR(info.dryOffDate)} · Doğum: ${formatDateTR(info.estimatedCalvingDate)}</div>
                                </div>
                                <span class="repro-pill repro-pill-dryoff">${dryLabel}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `
        : '';

    container.innerHTML = `<div class="home-repro-card">${birthsHtml}${dryOffHtml}</div>`;
}

window.saveBreedingDate = function (event, id) {
    event.preventDefault();
    const animal = allDataById.get(Number(id));
    if (!animal || animal.cinsiyet !== 'Dişi') return;

    const dateVal = document.getElementById('detailBreedingDate')?.value || '';
    const updatedAnimal = { ...animal, kogustuguTarih: dateVal };
    updateAnimalRecordInDB(updatedAnimal, () => {
        renderAnimalDetail(updatedAnimal.id);
        Swal.fire({
            title: 'Güncellendi!',
            text: dateVal ? 'Koğuşma / tohumlama tarihi kaydedildi.' : 'Koğuşma tarihi temizlendi.',
            icon: 'success',
            timer: 1400,
            showConfirmButton: false
        });
    });
};

window.clearBreedingDate = function (id) {
    const animal = allDataById.get(Number(id));
    if (!animal) return;
    const updatedAnimal = { ...animal, kogustuguTarih: '' };
    updateAnimalRecordInDB(updatedAnimal, () => {
        renderAnimalDetail(updatedAnimal.id);
    });
};

window.startAddCalfForMother = function (motherId) {
    const mother = allDataById.get(Number(motherId));
    if (!mother) return;

    resetAnimalForm();
    switchView('addView');

    document.getElementById('formTitle').innerText = `Yeni Buzağı Ekle (Anne: ${mother.kupeNo})`;
    document.getElementById('dogumTarihi').value = getTodayDateString();
    document.getElementById('anneKupeNo').value = mother.kupeNo || '';
    document.getElementById('anneCinsi').value = mother.hayvanCinsi || '';

    if (mother.hayvanResmi) {
        base64Anne = mother.hayvanResmi;
        const prevAnne = document.getElementById('previewAnne');
        prevAnne.src = base64Anne;
        prevAnne.style.display = 'block';
        document.getElementById('removeAnneBtn').style.display = 'flex';
    }
};

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
        renderHomeHerdStats();
        renderHomeMilkSummary();
        renderHomeReproductionAlerts();
        renderHomeHealthAlerts();
        if (onSuccess) onSuccess();
    };
}

function renderHomeHerdStats() {
    const container = document.getElementById('homeHerdStats');
    if (!container) return;

    const activeAnimals = allData.filter(row => !row.herdStatus || row.herdStatus === 'active');
    const femaleCount = activeAnimals.filter(r => r.cinsiyet === 'Dişi').length;
    const maleCount = activeAnimals.filter(r => r.cinsiyet === 'Erkek').length;
    const milkingCount = activeAnimals.filter(r => isAnimalMilking(r)).length;
    const pregnantCount = activeAnimals.filter(r => {
        const info = getPregnancyInfo(r);
        return info && !info.isStale && info.daysUntilCalving >= -14;
    }).length;

    let calfCount = 0;
    let heiferCount = 0;
    let cowCount = 0;
    let maleOlderCount = 0;
    activeAnimals.forEach(animal => {
        const grp = getAnimalAgeGroup(animal);
        if (grp === 'calf') calfCount += 1;
        else if (grp === 'heifer') heiferCount += 1;
        else if (grp === 'cow') cowCount += 1;
        else if (grp === 'maleYoungOrAdult') maleOlderCount += 1;
    });

    const soldAnimals = allData.filter(r => r.herdStatus === 'sold');
    const totalSaleRevenue = soldAnimals.reduce((sum, r) => sum + (Number(r.salePrice) || 0), 0);
    const totalHealthExpense = allData.reduce((sum, animal) => {
        return sum + getHealthRecords(animal).reduce((s, rec) => s + (Number(rec.cost) || 0), 0);
    }, 0);

    container.innerHTML = `
        <div class="home-stats-card">
            <div class="home-stats-header">
                <h3>📊 Sürü Özet Paneli</h3>
            </div>
            <div class="home-stats-grid">
                <div class="home-stat-box">
                    <span class="home-stat-box-label">Aktif Sürü</span>
                    <span class="home-stat-box-value">${activeAnimals.length}</span>
                    <span class="home-stat-box-sub">♀️ ${femaleCount} Dişi · ♂️ ${maleCount} Erkek</span>
                </div>
                <div class="home-stat-box">
                    <span class="home-stat-box-label">Sağılır / Gebe</span>
                    <span class="home-stat-box-value">${milkingCount} / ${pregnantCount}</span>
                    <span class="home-stat-box-sub">🥛 Sağılır · 🤰 Gebe</span>
                </div>
                <div class="home-stat-box">
                    <span class="home-stat-box-label">Toplam Satış</span>
                    <span class="home-stat-box-value" style="color: #198754;">${totalSaleRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</span>
                    <span class="home-stat-box-sub">${soldAnimals.length} satılan hayvan</span>
                </div>
                <div class="home-stat-box">
                    <span class="home-stat-box-label">Sağlık Gideri</span>
                    <span class="home-stat-box-value" style="color: #b45309;">${totalHealthExpense.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</span>
                    <span class="home-stat-box-sub">Aşı & tedavi toplamı</span>
                </div>
            </div>
            <div class="herd-age-pills">
                <span class="herd-age-pill">🐮 Buzağı (&lt;6 ay): ${calfCount}</span>
                <span class="herd-age-pill">🐄 Düve (6-24 ay): ${heiferCount}</span>
                <span class="herd-age-pill">🥛 İnek: ${cowCount}</span>
                <span class="herd-age-pill">🐂 Erkek (6+ ay): ${maleOlderCount}</span>
            </div>
        </div>
    `;
}

function escapeCsvCell(value) {
    const str = String(value ?? '');
    if (/[;"\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function downloadCsvFile(filename, headers, rows) {
    const lines = [
        headers.map(escapeCsvCell).join(';'),
        ...rows.map(row => row.map(escapeCsvCell).join(';'))
    ];
    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

window.exportAnimalsCSV = function () {
    if (!allData.length) {
        Swal.fire({ title: 'Bilgi', text: 'Dışa aktarılacak hayvan kaydı bulunmuyor.', icon: 'info', confirmButtonText: 'Tamam' });
        return;
    }

    const exitLabels = { sold: 'Satıldı', dead: 'Öldü', transferred: 'Başka işletmeye geçti' };
    const headers = [
        'Küpe No', 'Lakap', 'Cinsiyet', 'Irk', 'Doğum Tarihi', 'Yaş',
        'Sürü Durumu', 'Sağılır', 'Koğuştuğu Tarih', 'Tahmini Doğum Tarihi',
        'Anne Küpe No', 'Anne Irkı', 'Çıkış Tarihi', 'Satış Fiyatı (TL)',
        'Toplam Süt (L)', 'Toplam Sağlık Maliyeti (TL)'
    ];

    const rows = allData.map(animal => {
        const isActive = !animal.herdStatus || animal.herdStatus === 'active';
        const ageInfo = calculateAgeInfo(animal.dogumTarihi);
        const preg = getPregnancyInfo(animal);
        const totalMilk = getMilkRecords(animal).reduce((sum, r) => sum + (Number(r.morning) || 0) + (Number(r.evening) || 0), 0);
        const totalHealthCost = getHealthRecords(animal).reduce((sum, r) => sum + (Number(r.cost) || 0), 0);

        return [
            animal.kupeNo || '',
            animal.hayvanLakabi || '',
            animal.cinsiyet || '',
            animal.hayvanCinsi || '',
            formatDateTR(animal.dogumTarihi),
            ageInfo ? ageInfo.label : '',
            isActive ? 'Aktif Sürüde' : (exitLabels[animal.herdStatus] || 'Sürüden çıktı'),
            isAnimalMilking(animal) ? 'Evet' : 'Hayır',
            animal.kogustuguTarih ? formatDateTR(animal.kogustuguTarih) : '',
            preg && !preg.isStale ? formatDateTR(preg.estimatedCalvingDate) : '',
            animal.anneKupeNo || '',
            animal.anneCinsi || '',
            animal.exitDate ? formatDateTR(animal.exitDate) : '',
            animal.herdStatus === 'sold' ? formatLiters(animal.salePrice || 0) : '',
            totalMilk > 0 ? formatLiters(totalMilk) : '',
            totalHealthCost > 0 ? formatLiters(totalHealthCost) : ''
        ];
    });

    const today = getTodayDateString();
    downloadCsvFile(`Ciftlik_Hayvan_Listesi_${today}.csv`, headers, rows);
    Swal.fire({ title: 'İndirildi!', text: `${rows.length} hayvan kaydı CSV (Excel) olarak indirildi.`, icon: 'success', timer: 1600, showConfirmButton: false });
};

window.exportMilkCSV = function () {
    const selectedMonth = document.getElementById('exportMilkMonth')?.value || '';
    const headers = ['Tarih', 'Küpe No', 'Lakap', 'Irk', 'Sabah (L)', 'Akşam (L)', 'Günlük Toplam (L)'];
    const entries = [];

    allData.forEach(animal => {
        if (animal.cinsiyet !== 'Dişi') return;
        getMilkRecords(animal).forEach(rec => {
            if (selectedMonth && !String(rec.date || '').startsWith(selectedMonth)) return;
            const m = Number(rec.morning) || 0;
            const e = Number(rec.evening) || 0;
            entries.push({
                date: rec.date || '',
                row: [
                    formatDateTR(rec.date),
                    animal.kupeNo || '',
                    animal.hayvanLakabi || '',
                    animal.hayvanCinsi || '',
                    formatLiters(m),
                    formatLiters(e),
                    formatLiters(m + e)
                ]
            });
        });
    });

    if (!entries.length) {
        Swal.fire({
            title: 'Kayıt Bulunamadı',
            text: selectedMonth ? `${selectedMonth} dönemine ait süt kaydı yok.` : 'Dışa aktarılacak süt kaydı bulunmuyor.',
            icon: 'info',
            confirmButtonText: 'Tamam'
        });
        return;
    }

    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const suffix = selectedMonth || `Tumu_${getTodayDateString()}`;
    downloadCsvFile(`Ciftlik_Sut_Kayitlari_${suffix}.csv`, headers, entries.map(item => item.row));
    Swal.fire({ title: 'İndirildi!', text: `${entries.length} günlük süt kaydı CSV (Excel) olarak indirildi.`, icon: 'success', timer: 1600, showConfirmButton: false });
};

window.exportHealthCSV = function () {
    const headers = ['Tarih', 'Küpe No', 'Lakap', 'Tür', 'İşlem / Aşı Adı', 'İlaç / Marka', 'Maliyet (TL)', 'Sıradaki Tarih', 'Notlar'];
    const entries = [];

    allData.forEach(animal => {
        getHealthRecords(animal).forEach(rec => {
            const meta = HEALTH_TYPE_META[rec.type] || HEALTH_TYPE_META.other;
            entries.push({
                date: rec.date || '',
                row: [
                    formatDateTR(rec.date),
                    animal.kupeNo || '',
                    animal.hayvanLakabi || '',
                    meta.label.replace(/^[^\wÇĞİÖŞÜçğıöşü]+/, '').trim(),
                    rec.title || '',
                    rec.medicine || '',
                    rec.cost ? formatLiters(rec.cost) : '',
                    rec.nextDate ? formatDateTR(rec.nextDate) : '',
                    rec.notes || ''
                ]
            });
        });
    });

    if (!entries.length) {
        Swal.fire({ title: 'Kayıt Bulunamadı', text: 'Dışa aktarılacak sağlık veya aşı kaydı bulunmuyor.', icon: 'info', confirmButtonText: 'Tamam' });
        return;
    }

    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    downloadCsvFile(`Ciftlik_Saglik_Raporu_${getTodayDateString()}.csv`, headers, entries.map(item => item.row));
    Swal.fire({ title: 'İndirildi!', text: `${entries.length} sağlık kaydı CSV (Excel) olarak indirildi.`, icon: 'success', timer: 1600, showConfirmButton: false });
};

function aggregateHerdMilkSeries(days) {
    const dates = getRecentDateRange(days);
    const mapByDate = new Map(dates.map(date => [date, { date, morning: 0, evening: 0, total: 0, cowCount: 0 }]));
    const cowTotals = new Map();

    allData.forEach(animal => {
        if (animal.cinsiyet !== 'Dişi' || !Array.isArray(animal.milkRecords)) return;
        const isActive = !animal.herdStatus || animal.herdStatus === 'active';

        animal.milkRecords.forEach(rec => {
            const bucket = mapByDate.get(rec.date);
            if (!bucket) return;
            const m = Number(rec.morning) || 0;
            const e = Number(rec.evening) || 0;
            const tot = m + e;
            bucket.morning += m;
            bucket.evening += e;
            bucket.total += tot;
            if (tot > 0 || rec.morning !== undefined || rec.evening !== undefined) {
                bucket.cowCount += 1;
            }

            if (isActive && tot > 0) {
                const entry = cowTotals.get(animal.id) || { animal, total: 0, days: 0 };
                entry.total += tot;
                entry.days += 1;
                cowTotals.set(animal.id, entry);
            }
        });
    });

    const series = dates.map(d => mapByDate.get(d));
    const topCows = Array.from(cowTotals.values())
        .map(item => ({ ...item, avg: item.days ? item.total / item.days : 0 }))
        .sort((a, b) => b.avg - a.avg || b.total - a.total)
        .slice(0, 8);

    return { series, topCows };
}

function buildMilkBarChartSvg(series, tooltipId, showCowCount = true) {
    const width = 600;
    const height = 210;
    const padLeft = 40;
    const padRight = 14;
    const padTop = 24;
    const padBottom = 34;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const rawMax = Math.max(...series.map(d => d.total), 0);
    const maxVal = rawMax > 0 ? Math.ceil((rawMax * 1.15) / 5) * 5 : 10;
    const midVal = maxVal / 2;

    const n = series.length || 1;
    const slotW = plotW / n;
    const barW = Math.max(6, Math.min(34, slotW * 0.62));
    const labelStep = n <= 10 ? 1 : (n <= 16 ? 2 : 5);

    const yFor = (val) => padTop + plotH - (val / maxVal) * plotH;

    const gridLines = [0, midVal, maxVal].map(val => {
        const y = yFor(val);
        return `
            <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e9ecef" stroke-dasharray="3,3" />
            <text x="${padLeft - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#666">${formatLiters(val)}</text>
        `;
    }).join('');

    const bars = series.map((item, idx) => {
        const xCenter = padLeft + slotW * idx + slotW / 2;
        const xBar = xCenter - barW / 2;
        const morningH = (item.morning / maxVal) * plotH;
        const eveningH = (item.evening / maxVal) * plotH;
        const totalH = morningH + eveningH;
        const yMorning = padTop + plotH - morningH;
        const yEvening = padTop + plotH - totalH;
        const showXLabel = idx % labelStep === 0 || idx === n - 1;
        const showTopValue = n <= 14 && item.total > 0;
        const cowArg = showCowCount ? item.cowCount : -1;

        return `
            <g class="milk-chart-bar-group" onclick="showMilkChartPoint('${tooltipId}', '${item.date}', ${item.morning}, ${item.evening}, ${cowArg})">
                <rect class="bar-hit" x="${padLeft + slotW * idx}" y="${padTop}" width="${slotW}" height="${plotH}" fill="transparent" />
                ${morningH > 0 ? `<rect x="${xBar}" y="${yMorning}" width="${barW}" height="${morningH}" rx="2" fill="#f59e0b" />` : ''}
                ${eveningH > 0 ? `<rect x="${xBar}" y="${yEvening}" width="${barW}" height="${eveningH}" rx="2" fill="#0d6efd" />` : ''}
                ${showTopValue ? `<text x="${xCenter}" y="${Math.max(12, yEvening - 5)}" text-anchor="middle" font-size="10" font-weight="700" fill="#333">${formatLiters(item.total)}</text>` : ''}
                ${showXLabel ? `<text x="${xCenter}" y="${height - 10}" text-anchor="middle" font-size="10.5" fill="#666">${formatShortDateTR(item.date)}</text>` : ''}
            </g>
        `;
    }).join('');

    return `
        <svg class="milk-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Günlük süt verimi grafiği">
            ${gridLines}
            <line x1="${padLeft}" y1="${padTop + plotH}" x2="${width - padRight}" y2="${padTop + plotH}" stroke="#ced4da" />
            ${bars}
        </svg>
    `;
}

window.showMilkChartPoint = function (tooltipId, dateStr, morning, evening, cowCount) {
    const el = document.getElementById(tooltipId);
    if (!el) return;
    const total = (Number(morning) || 0) + (Number(evening) || 0);
    const cowPart = cowCount >= 0 ? ` · ${cowCount} inek` : '';
    el.innerHTML = `<strong>📅 ${formatDateTR(dateStr)}</strong> — 🌅 Sabah: <strong>${formatLiters(morning)} L</strong> · 🌇 Akşam: <strong>${formatLiters(evening)} L</strong> · Toplam: <strong>${formatLiters(total)} L</strong>${cowPart}`;
};

function renderHomeMilkSummary() {
    const container = document.getElementById('homeMilkSummary');
    if (!container) return;

    const today = getTodayDateString();
    const activeMilking = getActiveMilkingAnimals();
    const { series } = aggregateHerdMilkSeries(7);
    const todayStats = series[series.length - 1] || { morning: 0, evening: 0, total: 0, cowCount: 0 };

    const recordedDays = series.filter(d => d.total > 0);
    const avg7 = recordedDays.length
        ? recordedDays.reduce((sum, d) => sum + d.total, 0) / recordedDays.length
        : 0;

    let enteredMilkingToday = 0;
    activeMilking.forEach(animal => {
        if (getMilkRecords(animal).some(r => r.date === today && ((Number(r.morning) || 0) + (Number(r.evening) || 0) > 0))) {
            enteredMilkingToday += 1;
        }
    });

    container.innerHTML = `
        <div class="home-milk-card">
            <div class="home-milk-header">
                <div>
                    <h3>🥛 Bugünkü Süt Özeti</h3>
                    <span class="home-milk-date">${formatDateTR(today)}</span>
                </div>
                <button type="button" class="home-milk-btn" onclick="switchView('milkView')">Toplu Süt Gir →</button>
            </div>
            <div class="home-milk-metrics">
                <div class="home-milk-metric">
                    <span class="home-milk-metric-label">Bugün Sürü Toplamı</span>
                    <span class="home-milk-metric-value">${formatLiters(todayStats.total)} L</span>
                    <span class="home-milk-metric-sub">Sabah ${formatLiters(todayStats.morning)} L · Akşam ${formatLiters(todayStats.evening)} L</span>
                </div>
                <div class="home-milk-metric">
                    <span class="home-milk-metric-label">Sağılır İnek</span>
                    <span class="home-milk-metric-value">${enteredMilkingToday} / ${activeMilking.length}</span>
                    <span class="home-milk-metric-sub">Bugün süt girilen</span>
                </div>
                <div class="home-milk-metric">
                    <span class="home-milk-metric-label">Son 7 Gün Ort.</span>
                    <span class="home-milk-metric-value">${recordedDays.length ? `${formatLiters(avg7)} L` : '-'}</span>
                    <span class="home-milk-metric-sub">${recordedDays.length ? `${recordedDays.length} kayıtlı gün` : 'Henüz kayıt yok'}</span>
                </div>
            </div>
        </div>
    `;
}

function renderMilkAnalyticsSection() {
    const container = document.getElementById('milkAnalyticsSection');
    if (!container) return;

    const { series, topCows } = aggregateHerdMilkSeries(milkChartRange);
    const periodTotal = series.reduce((sum, d) => sum + d.total, 0);
    const recordedDays = series.filter(d => d.total > 0);
    const dailyAvg = recordedDays.length ? periodTotal / recordedDays.length : 0;
    const peakDay = recordedDays.reduce((best, cur) => (!best || cur.total > best.total ? cur : best), null);

    const topCowsHtml = topCows.length === 0
        ? '<div class="milk-empty-state">Seçili dönemde henüz süt kaydı bulunmuyor.</div>'
        : `<div class="top-cows-list">${topCows.map((item, idx) => {
            const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));
            return `
                <div class="top-cow-item" onclick="openAnimalDetail(${item.animal.id})">
                    <div class="top-cow-left">
                        <span class="top-cow-rank ${rankClass}">${idx + 1}</span>
                        <div>
                            <div class="top-cow-name">Küpe: ${escapeHtml(item.animal.kupeNo)}${item.animal.hayvanLakabi ? ` (${escapeHtml(item.animal.hayvanLakabi)})` : ''}</div>
                            <div class="top-cow-sub">${escapeHtml(item.animal.hayvanCinsi || '')} · ${item.days} gün kayıt</div>
                        </div>
                    </div>
                    <div class="top-cow-right">
                        <div class="top-cow-avg">${formatLiters(item.avg)} L/gün</div>
                        <div class="top-cow-total">Toplam: ${formatLiters(item.total)} L</div>
                    </div>
                </div>
            `;
        }).join('')}</div>`;

    container.innerHTML = `
        <div class="card">
            <div class="chart-header-bar">
                <h3>📊 Sürü Süt Verimi Grafiği</h3>
                <div class="chart-range-tabs">
                    <button type="button" class="chart-range-btn ${milkChartRange === 7 ? 'active' : ''}" onclick="setMilkChartRange(7)">Son 7 Gün</button>
                    <button type="button" class="chart-range-btn ${milkChartRange === 30 ? 'active' : ''}" onclick="setMilkChartRange(30)">Son 30 Gün</button>
                </div>
            </div>

            <div class="milk-stats-grid" style="margin-top: 0;">
                <div class="milk-stat-card">
                    <span class="milk-stat-label">${milkChartRange} Gün Toplam</span>
                    <span class="milk-stat-value">${formatLiters(periodTotal)} L</span>
                </div>
                <div class="milk-stat-card">
                    <span class="milk-stat-label">Günlük Ort. (${recordedDays.length} gün)</span>
                    <span class="milk-stat-value">${recordedDays.length ? `${formatLiters(dailyAvg)} L` : '-'}</span>
                </div>
                <div class="milk-stat-card">
                    <span class="milk-stat-label">En Yüksek Gün</span>
                    <span class="milk-stat-value">${peakDay ? `${formatLiters(peakDay.total)} L` : '-'}</span>
                    ${peakDay ? `<span class="home-milk-metric-sub">${formatDateTR(peakDay.date)}</span>` : ''}
                </div>
            </div>

            <div class="milk-chart-legend">
                <span><i class="legend-dot legend-morning"></i>Sabah Sütü</span>
                <span><i class="legend-dot legend-evening"></i>Akşam Sütü</span>
            </div>
            <div class="milk-chart-wrapper">${buildMilkBarChartSvg(series, 'herdMilkChartTooltip', true)}</div>
            <div id="herdMilkChartTooltip" class="milk-chart-tooltip">Günlük sabah/akşam detayını görmek için grafikteki çubuklara dokunun.</div>

            <h4 class="milk-history-title" style="margin-top: 1.4rem;">🏆 En Verimli İnekler (Son ${milkChartRange} Gün)</h4>
            ${topCowsHtml}
        </div>
    `;
}

function renderMilkView() {
    const container = document.getElementById('milkDashboardContainer');
    if (!container) return;

    if (!bulkMilkDate) {
        bulkMilkDate = getTodayDateString();
    }

    const activeMilking = getActiveMilkingAnimals();
    let totalMorning = 0;
    let totalEvening = 0;
    let filledCount = 0;

    const rowsHtml = activeMilking.map(animal => {
        const rec = getMilkRecords(animal).find(r => r.date === bulkMilkDate) || null;
        const morningVal = rec && rec.morning !== undefined && rec.morning !== null ? rec.morning : '';
        const eveningVal = rec && rec.evening !== undefined && rec.evening !== null ? rec.evening : '';
        const mNum = Number(morningVal) || 0;
        const eNum = Number(eveningVal) || 0;
        const rowTotal = mNum + eNum;

        totalMorning += mNum;
        totalEvening += eNum;
        if (morningVal !== '' || eveningVal !== '') {
            filledCount += 1;
        }

        const searchKey = `${animal.kupeNo || ''} ${animal.hayvanLakabi || ''}`.toLowerCase();
        return `
            <div class="bulk-milk-row" data-search="${escapeHtml(searchKey)}">
                <div class="bulk-milk-row-header">
                    <span class="bulk-cow-link" onclick="openAnimalDetail(${animal.id})">
                        Küpe: ${escapeHtml(animal.kupeNo)}
                        ${animal.hayvanLakabi ? `<span class="bulk-cow-nick">(${escapeHtml(animal.hayvanLakabi)})</span>` : ''}
                    </span>
                    <span class="bulk-row-total" id="bulkRowTotal-${animal.id}">Toplam: ${formatLiters(rowTotal)} L</span>
                </div>
                <div class="bulk-milk-inputs">
                    <div>
                        <label for="bulkMorning-${animal.id}">🌅 Sabah (L)</label>
                        <input type="number" id="bulkMorning-${animal.id}" class="bulk-milk-input" data-animal-id="${animal.id}" data-part="morning" min="0" step="0.1" inputmode="decimal" placeholder="0" value="${morningVal}" oninput="onBulkMilkInput(${animal.id})">
                    </div>
                    <div>
                        <label for="bulkEvening-${animal.id}">🌇 Akşam (L)</label>
                        <input type="number" id="bulkEvening-${animal.id}" class="bulk-milk-input" data-animal-id="${animal.id}" data-part="evening" min="0" step="0.1" inputmode="decimal" placeholder="0" value="${eveningVal}" oninput="onBulkMilkInput(${animal.id})">
                    </div>
                </div>
            </div>
        `;
    }).join('');

    const bulkEntryContent = activeMilking.length === 0
        ? `
            <div class="milk-empty-state">
                Şu an sürüde <strong>Sağılır Hayvan</strong> olarak işaretlenmiş inek bulunmuyor.<br>
                Dişi hayvanları eklerken/düzenlerken veya detay sayfasından <strong>Sağılır Hayvan</strong> olarak işaretlediğinizde burada toplu süt girişi yapabilirsiniz.
                <div style="margin-top: 12px;">
                    <button type="button" class="btn-primary" style="max-width: 240px;" onclick="switchView('listView')">Hayvan Listesine Git</button>
                </div>
            </div>
        `
        : `
            <div class="bulk-summary-strip">
                <div class="bulk-summary-box">
                    <span class="bulk-summary-label">🌅 Sabah Toplamı</span>
                    <span class="bulk-summary-val" id="bulkMorningTotal">${formatLiters(totalMorning)} L</span>
                </div>
                <div class="bulk-summary-box">
                    <span class="bulk-summary-label">🌇 Akşam Toplamı</span>
                    <span class="bulk-summary-val" id="bulkEveningTotal">${formatLiters(totalEvening)} L</span>
                </div>
                <div class="bulk-summary-box total-highlight">
                    <span class="bulk-summary-label">🥛 Sürü Toplamı</span>
                    <span class="bulk-summary-val" id="bulkGrandTotal">${formatLiters(totalMorning + totalEvening)} L</span>
                </div>
                <div class="bulk-summary-box">
                    <span class="bulk-summary-label">Girilen İnek</span>
                    <span class="bulk-summary-val" id="bulkFilledCount">${filledCount} / ${activeMilking.length}</span>
                </div>
            </div>

            <div class="bulk-milk-search">
                <input type="text" id="bulkMilkSearchInput" placeholder="🔍 Sağılır ineklerde küpe veya lakap ara..." oninput="filterBulkMilkRows(this.value)">
            </div>

            <div class="bulk-milk-list" id="bulkMilkList">
                ${rowsHtml}
            </div>

            <button type="button" class="btn-primary" onclick="saveBulkMilkRecords()">💾 ${formatDateTR(bulkMilkDate)} Süt Kayıtlarını Kaydet</button>
        `;

    container.innerHTML = `
        <div class="card">
            <h2 style="margin-top: 0; color: #0056b3;">🥛 Toplu Günlük Süt Girişi</h2>
                <input type="date" id="bulkMilkDate" value="${bulkMilkDate}" onchange="setBulkMilkDate(this.value)">

            <div class="bulk-date-bar">
                <button type="button" onclick="shiftBulkMilkDate(-1)">‹ Önceki</button>
                <button type="button" class="btn-today" onclick="setBulkMilkDate(getTodayDateString())">Bugün</button>
                <button type="button" onclick="shiftBulkMilkDate(1)">Sonraki ›</button>
            </div>
            ${bulkEntryContent}
        </div>
        <div id="milkAnalyticsSection"></div>
    `;

    renderMilkAnalyticsSection();
}

window.setBulkMilkDate = function (dateStr) {
    if (!dateStr) return;
    bulkMilkDate = dateStr;
    renderMilkView();
};

window.shiftBulkMilkDate = function (deltaDays) {
    bulkMilkDate = addDaysToDateStr(bulkMilkDate || getTodayDateString(), deltaDays);
    renderMilkView();
};

window.filterBulkMilkRows = function (query) {
    const q = String(query || '').toLowerCase().trim();
    document.querySelectorAll('#bulkMilkList .bulk-milk-row').forEach(rowEl => {
        const key = rowEl.dataset.search || '';
        rowEl.style.display = !q || key.includes(q) ? 'block' : 'none';
    });
};

window.onBulkMilkInput = function (animalId) {
    const mEl = document.getElementById(`bulkMorning-${animalId}`);
    const eEl = document.getElementById(`bulkEvening-${animalId}`);
    const rowTotalEl = document.getElementById(`bulkRowTotal-${animalId}`);
    if (mEl && eEl && rowTotalEl) {
        const m = Number(mEl.value) || 0;
        const e = Number(eEl.value) || 0;
        rowTotalEl.innerText = `Toplam: ${formatLiters(m + e)} L`;
    }

    let sumMorning = 0;
    let sumEvening = 0;
    let filled = 0;
    const rows = document.querySelectorAll('#bulkMilkList .bulk-milk-row');
    rows.forEach(rowEl => {
        const morningInput = rowEl.querySelector('input[data-part="morning"]');
        const eveningInput = rowEl.querySelector('input[data-part="evening"]');
        const mRaw = morningInput?.value.trim() ?? '';
        const eRaw = eveningInput?.value.trim() ?? '';
        if (mRaw !== '' || eRaw !== '') filled += 1;
        sumMorning += Number(mRaw) || 0;
        sumEvening += Number(eRaw) || 0;
    });

    const mTotalEl = document.getElementById('bulkMorningTotal');
    const eTotalEl = document.getElementById('bulkEveningTotal');
    const gTotalEl = document.getElementById('bulkGrandTotal');
    const filledEl = document.getElementById('bulkFilledCount');
    if (mTotalEl) mTotalEl.innerText = `${formatLiters(sumMorning)} L`;
    if (eTotalEl) eTotalEl.innerText = `${formatLiters(sumEvening)} L`;
    if (gTotalEl) gTotalEl.innerText = `${formatLiters(sumMorning + sumEvening)} L`;
    if (filledEl) filledEl.innerText = `${filled} / ${rows.length}`;
};

window.saveBulkMilkRecords = function () {
    const dateStr = bulkMilkDate || document.getElementById('bulkMilkDate')?.value;
    if (!dateStr) return;

    const activeMilking = getActiveMilkingAnimals();
    const updates = [];
    let grandTotal = 0;

    for (const animal of activeMilking) {
        const mEl = document.getElementById(`bulkMorning-${animal.id}`);
        const eEl = document.getElementById(`bulkEvening-${animal.id}`);
        if (!mEl || !eEl) continue;

        const mRaw = mEl.value.trim();
        const eRaw = eEl.value.trim();
        const existingRecords = getMilkRecords(animal);
        const existingForDate = existingRecords.find(r => r.date === dateStr);

        if (mRaw === '' && eRaw === '') {
            if (existingForDate) {
                updates.push({
                    ...animal,
                    milkRecords: existingRecords.filter(r => r.date !== dateStr)
                });
            }
            continue;
        }

        const morning = mRaw === '' ? 0 : Number(mRaw);
        const evening = eRaw === '' ? 0 : Number(eRaw);
        if (!Number.isFinite(morning) || morning < 0 || !Number.isFinite(evening) || evening < 0) {
            Swal.fire({
                title: 'Hata',
                text: `Küpe ${animal.kupeNo} için geçerli bir süt miktarı girin.`,
                icon: 'error',
                confirmButtonText: 'Tamam'
            });
            return;
        }

        grandTotal += morning + evening;

        const unchanged = existingForDate &&
            Number(existingForDate.morning) === morning &&
            Number(existingForDate.evening) === evening;

        if (!unchanged) {
            const nextRecords = existingRecords.filter(r => r.date !== dateStr);
            nextRecords.push({ date: dateStr, morning, evening });
            nextRecords.sort((a, b) => String(b.date).localeCompare(String(a.date)));
            updates.push({
                ...animal,
                milkRecords: nextRecords
            });
        }
    }

    if (updates.length === 0) {
        Swal.fire({
            title: 'Bilgi',
            text: 'Kaydedilecek yeni bir değişiklik bulunmuyor.',
            icon: 'info',
            timer: 1500,
            showConfirmButton: false
        });
        return;
    }

    const tx = db.transaction("kayitlar", "readwrite");
    const store = tx.objectStore("kayitlar");
    updates.forEach(updatedAnimal => store.put(updatedAnimal));

    tx.oncomplete = () => {
        updates.forEach(updatedAnimal => {
            const idx = allData.findIndex(r => r.id === updatedAnimal.id);
            if (idx !== -1) allData[idx] = updatedAnimal;
            allDataById.set(updatedAnimal.id, updatedAnimal);
        });
        isListDirty = true;
        renderHomeMilkSummary();
        renderMilkAnalyticsSection();
        Swal.fire({
            title: 'Kaydedildi!',
            text: `${formatDateTR(dateStr)} için ${updates.length} hayvan güncellendi. Günlük toplam: ${formatLiters(grandTotal)} L`,
            icon: 'success',
            timer: 1800,
            showConfirmButton: false
        });
    };
};

window.setMilkChartRange = function (days) {
    milkChartRange = days === 30 ? 30 : 7;
    renderMilkAnalyticsSection();
};

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