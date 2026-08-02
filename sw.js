// update-version.js
const fs = require('fs');

const swPath = './sw.js';

try {
    // 1. sw.js dosyasını fiziksel olarak oku
    let content = fs.readFileSync(swPath, 'utf8');
    
    // 2. Zaman damgasını oluştur
    const newVersion = `ciftlik-pro-v${Date.now()}`;
    
    // 3. Eski CACHE_NAME satırını bul ve yenisiyle değiştir (Tırnak tipine bakmaksızın ezer)
    content = content.replace(/const CACHE_NAME = .*/, `const CACHE_NAME = '${newVersion}';`);
    
    // 4. Dosyayı kaydet
    fs.writeFileSync(swPath, content);
    
    console.log(`✅ Service Worker versiyonu başarıyla güncellendi: ${newVersion}`);
} catch (err) {
    console.error("❌ Versiyon güncellenirken hata oluştu:", err);
    // Hata olursa Render'ın derlemeyi durdurması için çıkış kodu ekliyoruz
    process.exit(1); 
}