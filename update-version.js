// update-version.js
const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, 'sw.js');

try {
    const newVersion = `ciftlik-pro-v${Date.now()}`;
    let content = fs.readFileSync(swPath, 'utf8');

    content = content.replace(
        /const\s+CACHE_NAME\s*=\s*['"][^'"]*['"];?/,
        `const CACHE_NAME = '${newVersion}';`
    );

    fs.writeFileSync(swPath, content, 'utf8');

    console.log(`✅ Service Worker versiyonu başarıyla güncellendi: ${newVersion}`);
} catch (err) {
    console.error('❌ Versiyon güncellenirken hata oluştu:', err);
    process.exit(1);
}