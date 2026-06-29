const fs = require('fs');
const path = require('path');

const directories = ["en", "hi", "mr", "gu"];

function patch_file(lang) {
    const file_path = path.join(lang, "index.html");
    if (!fs.existsSync(file_path)) {
        console.log(`${file_path} not found`);
        return;
    }

    let content = fs.readFileSync(file_path, "utf-8");

    // 1. Center the language selector
    content = content.replace(
        ".lang-selector {\n    background: var(--bg);", 
        ".lang-selector {\n    background: var(--bg);\n    justify-content: center;"
    );

    // 2. Change the Shark tank logo in the top bar
    content = content.replace(
        'src="../assets/shark-tank-logo.jpg" alt="Shark Tank" style="height:32px;border-radius:50%;"',
        'src="../assets/shark-tank-vertical.png" alt="Shark Tank" style="height:48px;"'
    );

    // 3. Change the Shark tank logo in the bottom CTA band
    content = content.replace(
        'src="../assets/shark-tank-logo.jpg" alt="Shark Tank" style="height:40px;vertical-align:middle;margin-right:6px;border-radius:50%;"',
        'src="../assets/shark-tank-vertical.png" alt="Shark Tank" style="height:60px;vertical-align:middle;margin-right:8px;"'
    );

    fs.writeFileSync(file_path, content, "utf-8");
    console.log("Patched " + file_path);
}

directories.forEach(patch_file);
