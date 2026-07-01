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

    // Replace the Meta purchase event
    content = content.replace(
        "fbq('track', 'Purchase', { currency: 'INR', value: 1.00 }, { eventID: eventId });",
        "fbq('trackCustom', 'ordertakerpurchase', { currency: 'INR', value: 1.00 }, { eventID: eventId });"
    );

    fs.writeFileSync(file_path, content, "utf-8");
    console.log("Patched " + file_path);
}

directories.forEach(patch_file);
