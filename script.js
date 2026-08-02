
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
}

function handleEnter(e) {
    if (e.key === 'Enter') {
        checkPassword();
    }
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
// YENİ KAYITLAR İÇİN: Fotoğrafı yüklenirken anında sıkıştıran fonksiyon
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

                // En-boy oranını koruyarak yeniden boyutlandır
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

                // %70 kalite ile JPEG formatında hafiflet
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
        cancelEdit();
        loadData();
    };
    Swal.fire({
        title: "Başarılı!",
        text: "Hayvan kaydı başarıyla " + (editId ? "güncellendi!" : "eklendi!"),
        icon: "success",
        confirmButtonColor: "#28a745",
        confirmButtonText: 'Tamam',

    });
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
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = "";

    if (filteredData.length === 0) {
        tbody.innerHTML = `
                    <tr>
                        <td colspan="11" style="text-align: center; padding: 2rem; color: #666; font-style: italic;">
                            Aradığınız kriterlere uygun kayıt bulunamadı.
                        </td>
                    </tr>
                `;
        return;
    }

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const pageData = filteredData.slice(startIndex, endIndex);

    pageData.forEach((row, index) => {
        const hayvanResmiHtml = row.hayvanResmi ? `<img src="${row.hayvanResmi}" class="table-img" onclick="openModal(this.src)">` : '<span style="color:#999; font-size:0.8rem;">Yok</span>';
        const anneResmiHtml = row.anneResmi ? `<img src="${row.anneResmi}" class="table-img" onclick="openModal(this.src)">` : '<span style="color:#999; font-size:0.8rem;">Yok</span>';

        tbody.innerHTML += `
                    <tr>
                        <td><strong>${startIndex + index + 1}</strong></td>
                        <td>${row.kupeNo}</td>
                        <td>${row.hayvanLakabi || '-'}</td>
                        <td>${row.cinsiyet}</td>
                        <td>${row.hayvanCinsi}</td>
                        <td>${row.dogumTarihi}</td>
                        <td>${row.kogustuguTarih}</td>
                        <td>${row.anneKupeNo || '-'}</td>
                        <td>${hayvanResmiHtml}</td>
                        <td>${anneResmiHtml}</td>
                        <td>
                            <button class="btn-info" onclick='startEdit(${JSON.stringify(row)})'>Düzenle</button>
                            <button class="btn-danger" onclick="deleteData(${row.id})">Sil</button>
                        </td>
                    </tr>
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

    window.scrollTo(0, 0);
};

window.cancelEdit = function () {
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
                    confirmButtonText: 'Kapat' // Buraya istediğin metni yazabilirsin
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

// Düzeltilmiş Yedek Alma Fonksiyonu
window.exportJSON = function () {
    showLoading("Yedek alınıyor, lütfen bekleyiniz...");

    // Tarayıcının loading ekranını çizmesine izin vermek için 100ms mola veriyoruz
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

        hideLoading(); // Dosya inince kapat

        Swal.fire({
            title: 'Yedek Alındı!',
            text: 'Yedek başarıyla alındı ve cihazınıza indirildi.',
            icon: 'success',
            confirmButtonText: 'Kapat' // Buraya istediğin metni yazabilirsin
        });
    }, 100);
};

// Düzeltilmiş Yedek Yükleme Fonksiyonu
window.importJSON = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    Swal.fire({
        title: 'DİKKAT!',
        text: "Yedek yüklediğinizde mevcut tüm verileriniz SİLİNECEK. Onaylıyor musunuz?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ffc107',
        confirmButtonText: 'Evet, Yükle!',
        cancelButtonText: 'İptal'
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
                        Swal.fire({
                            title: 'Tamamlandı!',
                            text: 'Yedek başarıyla yüklendi.',
                            icon: 'success',
                            confirmButtonText: 'Kapat' // Buraya istediğin metni yazabilirsin
                        });
                        loadData();
                    };
                } catch (err) {
                    hideLoading();
                    Swal.fire({
                        title: 'Hata!',
                        text: 'Geçersiz yedek dosyası!',
                        icon: 'error',
                        confirmButtonText: 'Kapat' // Buraya istediğin metni yazabilirsin
                    });
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
    if (peer) {
        peer.destroy();
        peer = null;
    }
    const btn = document.getElementById('btnReceiveQR');
    if (btn) {
        btn.innerText = "Alıcı Karekodu Oluştur";
        btn.style.background = "";
    }
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
    if (btn) {
        btn.innerText = "Kamerayı Aç ve Okut";
        btn.style.background = "#6f42c1";
    }
}

window.toggleReceiveQR = function () {
    const btn = document.getElementById('btnReceiveQR');

    if (btn.innerText === "Kapat") {
        resetPeerState();
        return;
    }

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

            // 1. Gönderici aktarımı başlatmak istiyor
            if (msg.type === 'START') {
                incomingData = [];
                expectedTotal = msg.total;
                showLoading(`Bağlantı kuruldu. 0 / ${expectedTotal} hayvan indiriliyor...`);

                // Alıcı hazır olduğunu Göndericiye bildiriyor
                conn.send({ type: 'READY' });
            }
            // 2. Tekil hayvan verisi geldiğinde
            else if (msg.type === 'CHUNK') {
                incomingData.push(msg.data);
                showLoading(`İndiriliyor: ${incomingData.length} / ${expectedTotal} hayvan tamamlandı...`);

                // Hayvanı başarıyla aldığını Göndericiye bildiriyor (Ping-Pong)
                conn.send({ type: 'ACK' });
            }
            // 3. Gönderici tamamen bittiğini söylediğinde
            else if (msg.type === 'END') {
                hideLoading();
                Swal.fire({
                    title: 'Veri Aktarımı Tamamlandı',
                    text: `Karşı cihazdan ${incomingData.length} hayvan kaydı başarıyla indirildi! Mevcut veriler silinip yenileri eklenecek. Onaylıyor musunuz?`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Evet, Yükle',
                    cancelButtonText: 'İptal',
                    confirmButtonColor: '#28a745'
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
                                Swal.fire({
                                    title: 'Başarılı!',
                                    text: 'Veriler başarıyla aktarıldı!',
                                    icon: 'success',
                                    confirmButtonText: 'Tamam'
                                });
                                loadData();
                                resetPeerState();
                            };
                            tx.onerror = () => {
                                hideLoading();
                                Swal.fire({
                                    title: 'Hata!',
                                    text: 'Veritabanına yazılırken bir hata oluştu!',
                                    icon: 'error',
                                    confirmButtonText: 'Tamam'
                                });
                                resetPeerState();
                            }
                        }, 100);
                    } else {
                        resetPeerState();
                    }
                });
            }
        });

        conn.on('error', function (err) {
            hideLoading();
            Swal.fire({
                title: 'Hata!',
                text: 'Veri aktarımı sırasında bağlantı koptu veya hata oluştu.',
                icon: 'error',
                confirmButtonText: 'Tamam'
            });
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

// 2. Gönderici Cihazda Kamerayı Açma (Aç/Kapat Mantığı)
window.toggleQRScanner = function () {
    const btn = document.getElementById('btnScanQR');

    // Eğer kamera zaten açıksa, kapat
    if (btn.innerText === "Kapat" || isScanning) {
        resetScannerState();
        return;
    }

    // Açık değilse kamerayı başlat
    document.getElementById('reader').style.display = 'block';

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
    }

    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText, decodedResult) => {
            // Okuma başarılı olunca kamerayı kapat ve veriyi gönder
            resetScannerState();
            sendDataToPeer(decodedText);
        },
        (errorMessage) => {
            // Kamera okuma devam ediyor
        }
    ).then(() => {
        isScanning = true;
        // Kamera başarıyla açıldı, butonu Kapat'a çevir
        btn.innerText = "Kapat";
        btn.style.background = "#dc3545"; // Kırmızı renk
    }).catch((err) => {
        Swal.fire('Hata!', 'Kamera başlatılamadı: ' + err, 'error');
        resetScannerState();
    });
};

function sendDataToPeer(targetPeerId) {
    if (!peer || peer.destroyed) {
        peer = new Peer();
    }

    const connectAndSend = () => {
        showLoading("Alıcı cihaza bağlanılıyor...");

        setTimeout(() => {
            const tx = db.transaction("kayitlar", "readonly");
            const request = tx.objectStore("kayitlar").getAll();

            request.onsuccess = () => {
                const allData = request.result;
                const conn = peer.connect(targetPeerId);

                let currentIndex = 0; // Hangi hayvanda kaldığımızı tutan sayaç

                conn.on('open', function () {
                    // 1. Alıcıya kaç hayvan göndereceğimizi bildirip, ondan "Hazırım" cevabı bekliyoruz
                    conn.send({ type: 'START', total: allData.length });
                });

                // Alıcıdan gelen cevapları dinliyoruz
                conn.on('data', function (msg) {

                    // Alıcı hazırsa (READY) veya bir önceki hayvanı başarıyla aldıysa (ACK)
                    if (msg.type === 'READY' || msg.type === 'ACK') {

                        // Eğer hala gönderilecek hayvan varsa
                        if (currentIndex < allData.length) {
                            showLoading(`Gönderiliyor: ${currentIndex + 1} / ${allData.length} hayvan...`);
                            conn.send({ type: 'CHUNK', data: allData[currentIndex] });
                            currentIndex++; // Sayacı bir artır
                        }
                        // Tüm hayvanlar bittiyse
                        else {
                            conn.send({ type: 'END' });
                            hideLoading();
                            Swal.fire({
                                title: 'Başarılı!',
                                text: 'Tüm veriler karşı cihaza başarıyla gönderildi.',
                                icon: 'success',
                                confirmButtonText: 'Tamam'
                            });
                            setTimeout(() => resetPeerState(), 500);
                        }
                    }
                });

                conn.on('error', function (err) {
                    hideLoading();
                    Swal.fire({
                        title: 'Hata!',
                        text: 'Gönderim hatası: Bağlantı kurulamadı.',
                        icon: 'error',
                        confirmButtonText: 'Tamam'
                    });
                    resetPeerState();
                });
            };
        }, 100);
    };

    if (peer.open) {
        connectAndSend();
    } else {
        peer.on('open', () => {
            connectAndSend();
        });
    }
}


// PWA GÜNCELLEME VE SERVICE WORKER KONTROLÜ
let updatePromptShown = false;
let updateAccepted = false;

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
                            didClose: () => {
                                updatePromptShown = false;
                            }
                        }).then((result) => {
                            if (result.isConfirmed) {
                                updateAccepted = true;
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                                refreshing = true;
                                window.location.reload();
                            }
                        });
                    }
                });
            });
        }).catch(err => console.log('Service worker hatası', err));

        let refreshing = false;
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

    // Sadece şifre ekranı görünürken ve zaten input/butona tıklanmadıysa çalışsın
    if (loginScreen.style.display !== 'none' && event.target !== passwordInput && event.target.tagName !== 'BUTTON') {
        passwordInput.focus();
    }
});


// Eski devasa fotoğrafları bulup tarayıcıda küçülten script
// Eski devasa fotoğrafları bulup tarayıcıda küçülten script (Hata Düzeltmeli Versiyon)
window.optimizeDatabase = async function () {
    if (!confirm("Bu işlem, veritabanındaki eski ve çok büyük boyutlu fotoğrafları tarayıp kalitesini bozmadan sıkıştıracaktır. İşlem telefonun hızına göre 1-2 dakika sürebilir. Başlamak istiyor musunuz?")) return;

    showLoading("Veritabanı taranıyor, lütfen bekleyin...");

    // 1. ADIM: Sadece Okuma (Readonly) modunda verileri çek ve işlemi hemen kapat
    const txRead = db.transaction("kayitlar", "readonly");
    const storeRead = txRead.objectStore("kayitlar");
    const request = storeRead.getAll();

    request.onsuccess = async () => {
        const records = request.result;
        let updatedRecords = []; // Değişen kayıtları hafızada tutacağımız dizi

        // 2. ADIM: Veritabanı bağlantısından bağımsız olarak hafızada sıkıştırma yap
        for (let i = 0; i < records.length; i++) {
            let row = records[i];
            let changed = false;

            showLoading(`İnceleniyor ve Sıkıştırılıyor: ${i + 1} / ${records.length} hayvan...`);

            // Eğer resim var ve boyutu çok büyükse (Örn: ~300 KB'dan büyükse)
            if (row.hayvanResmi && row.hayvanResmi.length > 300000) {
                row.hayvanResmi = await compressExistingBase64(row.hayvanResmi);
                changed = true;
            }
            if (row.anneResmi && row.anneResmi.length > 300000) {
                row.anneResmi = await compressExistingBase64(row.anneResmi);
                changed = true;
            }

            // Sıkıştırma yapıldıysa bu kaydı güncellenecekler listesine ekle
            if (changed) {
                updatedRecords.push(row);
            }
        }

        // 3. ADIM: Sıkıştırılmış veriler varsa YENİ BİR YAZMA İŞLEMİ (Readwrite) başlat
        if (updatedRecords.length > 0) {
            showLoading("Sıkıştırılan veriler veritabanına yazılıyor...");

            const txWrite = db.transaction("kayitlar", "readwrite");
            const storeWrite = txWrite.objectStore("kayitlar");

            // Hafızadaki hazır verileri bekleme yapmadan (senkron) veritabanına bas
            updatedRecords.forEach(record => {
                storeWrite.put(record);
            });

            txWrite.oncomplete = () => {
                hideLoading();
                Swal.fire('Optimizasyon Tamamlandı!', `Optimizasyon tamamlandı! Toplam ${updatedRecords.length} adet ağır kayıt başarıyla küçültüldü. Artık karekod aktarımı sorunsuz çalışacaktır.`, 'success');
                loadData();
            };

            txWrite.onerror = () => {
                hideLoading();
                Swal.fire('Hata!', 'Veriler yazılırken bir hata oluştu.', 'error');
            };

        } else {
            // Eğer hiçbir fotoğraf büyük değilse (zaten optimize edilmişse)
            hideLoading();
            Swal.fire('Optimizasyon Tamamlandı!', 'Harika! Veritabanında sıkıştırılması gereken ağır bir fotoğraf bulunamadı.', 'success');
        }
    };
};
// Base64 metnini alıp Canvas ile sıkıştıran yardımcı fonksiyon
function compressExistingBase64(base64Str) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
            } else {
                if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // %70 kalite ile JPEG'e çevirip geri gönder
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = base64Str;
    });
}
