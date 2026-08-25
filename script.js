const hashed_data = "96a8f45187e9360673b36d3b6fa2dedccae4a05522241b80e8632a41ef4d1be2";

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
    switchView('homeView'); // Uygulama açılırken Ana Sayfayı göster
}

function handleEnter(e) {
    if (e.key === 'Enter') {
        checkPassword();
    }
}

// YENİ: Ekranlar Arası Geçiş Fonksiyonu
// YENİ: Ekranlar Arası Geçiş Fonksiyonu
function switchView(viewId) {
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
    const activeBtn = document.querySelector(`.bottom-nav button[onclick="switchView('${viewId}')"]`);
    if(activeBtn) activeBtn.classList.add('active');

    // 4. Sayfayı en üste kaydır
    window.scrollTo(0, 0);
}

let db;
let base64Hayvan = "";
let base64Anne = "";
let allData = [];
let filteredData = [];
let currentPage = 1;
const rowsPerPage = 10;

const request = indexedDB.open("CiftlikPro", 1);
request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains("kayitlar")) {
        db.createObjectStore("kayitlar", { keyPath: "id", autoIncrement: true });
    }
};
request.onsuccess = (e) => {
    db = e.target.result;
    loadData();
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

document.getElementById('animalForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const data = {
        kupeNo: document.getElementById('kupeNo').value,
        hayvanLakabi: document.getElementById('hayvanLakabi').value,
        cinsiyet: document.getElementById('cinsiyet').value,
        hayvanCinsi: document.getElementById('hayvanCinsi').value,
        dogumTarihi: document.getElementById('dogumTarihi').value,
        anneKupeNo: document.getElementById('anneKupeNo').value,
        anneCinsi: document.getElementById('anneCinsi').value,
        kogustuguTarih: document.getElementById('kogustuguTarih').value,
        hayvanResmi: base64Hayvan,
        anneResmi: base64Anne
    };

    const editId = document.getElementById('editId').value;
    if (editId) data.id = Number(editId);

    const tx = db.transaction("kayitlar", "readwrite");
    const store = tx.objectStore("kayitlar");

    if (editId) store.put(data);
    else store.add(data);

    tx.oncomplete = () => {
        cancelEdit(); // Formu sıfırla
        loadData();
        Swal.fire({
            title: "Başarılı!",
            text: "Hayvan kaydı başarıyla " + (editId ? "güncellendi!" : "eklendi!"),
            icon: "success",
            confirmButtonColor: "#28a745",
            confirmButtonText: 'Tamam',
        }).then(() => {
            // Kayıt bittikten sonra otomatik olarak Sürü Listesine dön
            switchView('listView');
        });
    };
});

function loadData() {
    const tx = db.transaction("kayitlar", "readonly");
    const request = tx.objectStore("kayitlar").getAll();

    request.onsuccess = () => {
        allData = request.result.sort((a, b) => a.id - b.id);
        document.getElementById('totalCount').innerText = "Toplam Hayvan Sayısı: " + allData.length;
        applyFilter();
    };
}

window.applyFilter = function () {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    filteredData = allData.filter(row => {
        const kupe = (row.kupeNo || "").toLowerCase();
        const cins = (row.hayvanCinsi || "").toLowerCase();
        const lakap = (row.hayvanLakabi || "").toLowerCase();
        return kupe.includes(searchTerm) || cins.includes(searchTerm) || lakap.includes(searchTerm);
    });
    currentPage = 1;
    renderTable();
    renderPagination();
};

function renderTable() {
    // Artık tablo tbody yerine, kartları koyacağımız div'i seçiyoruz
    const container = document.getElementById('cardContainer');
    container.innerHTML = "";

    if (filteredData.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: #666; font-style: italic; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">Aradığınız kriterlere uygun hayvan bulunamadı.</div>`;
        return;
    }

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);

    pageData.forEach((row, index) => {
        // Resim varsa göster, yoksa gri "Fotoğraf Yok" kutusu oluştur
        const hayvanResmiHtml = row.hayvanResmi ? `<img src="${row.hayvanResmi}" class="card-img" onclick="openModal(this.src)">` : '<div class="card-no-img">Fotoğraf Yok</div>';
        const anneResmiHtml = row.anneResmi ? `<img src="${row.anneResmi}" class="card-img" onclick="openModal(this.src)">` : '<div class="card-no-img">Fotoğraf Yok</div>';

        // Kart şablonu
        container.innerHTML += `
            <div class="animal-card">
                <div class="card-header">
                    <h3>Küpe: ${row.kupeNo}</h3>
                    <span class="card-badge">#${startIndex + index + 1}</span>
                </div>
                <div class="card-body">
                    <div class="card-info-row"><strong>Lakap:</strong> <span>${row.hayvanLakabi || '-'}</span></div>
                    <div class="card-info-row"><strong>Cinsiyet:</strong> <span>${row.cinsiyet}</span></div>
                    <div class="card-info-row"><strong>Irk:</strong> <span>${row.hayvanCinsi}</span></div>
                    <div class="card-info-row"><strong>Doğum Tarihi:</strong> <span>${row.dogumTarihi || '-'}</span></div>
                    <div class="card-info-row"><strong>Koğuştuğu Tarih:</strong> <span>${row.kogustuguTarih || '-'}</span></div>
                    <div class="card-info-row"><strong>Anne Küpe No:</strong> <span>${row.anneKupeNo || '-'}</span></div>
                    
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
                    <button class="btn-info" onclick='startEdit(${JSON.stringify(row)})'>✏️ Düzenle</button>
                    <button class="btn-danger" onclick="deleteData(${row.id})">🗑️ Sil</button>
                </div>
            </div>
        `;
    });
}

function renderPagination() {
    const paginationDiv = document.getElementById('pagination');
    paginationDiv.innerHTML = "";
    const totalPages = Math.ceil(filteredData.length / rowsPerPage);
    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        btn.className = i === currentPage ? 'page-btn active' : 'page-btn';
        btn.onclick = () => {
            currentPage = i;
            renderTable();
            renderPagination();
        };
        paginationDiv.appendChild(btn);
    }
}

window.startEdit = function (row) {
    // Listede düzenleye basıldığında otomatik form ekranına yönlendir
    switchView('addView');

    document.getElementById('formTitle').innerText = "Kayıt Düzenle";
    document.getElementById('submitBtn').innerText = "Güncelle";
    document.getElementById('cancelEditBtn').style.display = "block";

    document.getElementById('editId').value = row.id;
    document.getElementById('kupeNo').value = row.kupeNo;
    document.getElementById('hayvanLakabi').value = row.hayvanLakabi || "";
    document.getElementById('cinsiyet').value = row.cinsiyet;
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

window.cancelEdit = function () {
    const isEditing = document.getElementById('editId').value !== "";
    
    document.getElementById('animalForm').reset();
    document.getElementById('editId').value = "";
    document.getElementById('formTitle').innerText = "Yeni Hayvan Ekle";
    document.getElementById('submitBtn').innerText = "Kaydet";
    document.getElementById('cancelEditBtn').style.display = "none";

    document.getElementById('previewHayvan').style.display = 'none';
    document.getElementById('previewAnne').style.display = 'none';
    document.getElementById('removeHayvanBtn').style.display = 'none';
    document.getElementById('removeAnneBtn').style.display = 'none';

    base64Hayvan = "";
    base64Anne = "";

    // Eğer düzenlemeden iptale basıldıysa, listeye geri dön
    if (isEditing) {
        switchView('listView');
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
            const tx = db.transaction("kayitlar", "readwrite");
            tx.objectStore("kayitlar").delete(id);
            tx.oncomplete = () => {
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
                            showCancelButton: true, 
                            allowOutsideClick: false, 
                            allowEscapeKey: false,
                            confirmButtonText: 'Evet, Güncelle', 
                            cancelButtonText: 'Daha Sonra', 
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
    
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;

    filteredData = allData.filter(row => {
        const kupe = (row.kupeNo || "").toLowerCase();
        const lakap = (row.hayvanLakabi || "").toLowerCase();
        const matchesSearch = kupe.includes(searchTerm) || lakap.includes(searchTerm);
        const matchesCinsiyet = filterCinsiyet === "" || row.cinsiyet === filterCinsiyet;
        const matchesIrk = filterIrk === "" || row.hayvanCinsi === filterIrk;

        let matchesDate = true;
        if (startDate || endDate) {
            if (!row.dogumTarihi) {
                matchesDate = false;
            } else {
                if (startDate && row.dogumTarihi < startDate) matchesDate = false;
                if (endDate && row.dogumTarihi > endDate) matchesDate = false;
            }
        }

        return matchesSearch && matchesCinsiyet && matchesIrk && matchesDate;
    });
    
    const totalCountEl = document.getElementById('totalCount');
    if (filteredData.length === allData.length) {
        totalCountEl.innerText = "Toplam Hayvan Sayısı: " + allData.length;
    } else {
        totalCountEl.innerText = `Toplam Hayvan Sayısı: ${allData.length} (Eşleşen: ${filteredData.length})`;
    }
    
    currentPage = 1;
    renderTable();
    renderPagination();
};

window.clearSearch = function () {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterCinsiyet').value = '';
    document.getElementById('filterIrk').value = '';
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