let db;
let allAssets = []; 
let allPersons = [];

const request = indexedDB.open("WarehouseDB", 1);
request.onupgradeneeded = function(event) {
    db = event.target.result;
    if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets", { keyPath: "assetNumber" });
    if (!db.objectStoreNames.contains("transactions")) db.createObjectStore("transactions", { keyPath: "id", autoIncrement: true });
};
request.onsuccess = function(event) {
    db = event.target.result;
    setTodayDate();
    loadDashboardData();
};
request.onerror = function(event) {
    alert("خطا در اتصال به دیتابیس");
};

function setTodayDate() {
    const el = document.getElementById('today-date');
    if (el) {
        const faDate = new Intl.DateTimeFormat('fa-IR').format(new Date());
        el.innerText = faDate;
        if (document.getElementById('in-date')) document.getElementById('in-date').value = faDate;
        if (document.getElementById('out-date')) document.getElementById('out-date').value = faDate;
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if (pageId === 'list-page') loadAssetList();
    if (pageId === 'inventory-page') loadInventory();
    if (pageId === 'inbound-page') populateAssetSelect('in-asset');
    if (pageId === 'outbound-page') populateAssetSelect('out-asset');
    if (pageId === 'persons-page') loadPersons();
    if (pageId === 'reports-page') loadReports();
    if (pageId === 'home-page') loadDashboardData();
}

function loadDashboardData() {
    if (!db) return;
    const transaction = db.transaction(["assets"], "readonly");
    const store = transaction.objectStore("assets");
    const countRequest = store.count();
    countRequest.onsuccess = function() {
        const badge = document.getElementById('list-count');
        if (badge) badge.innerText = countRequest.result;
    };
}

function getAllAssetsFromDB(callback) {
    const transaction = db.transaction(["assets"], "readonly");
    const store = transaction.objectStore("assets");
    const request = store.getAll();
    request.onsuccess = function() {
        allAssets = request.result;
        if (callback) callback(allAssets);
    };
}

function loadAssetList() {
    const container = document.getElementById('list-container');
    container.innerHTML = '<p class="empty">در حال بارگذاری...</p>';
    getAllAssetsFromDB(function(assets) {
        renderList(assets, container);
        document.getElementById('list-count').innerText = assets.length;
    });
}

function renderList(assets, container) {
    if (assets.length === 0) {
        container.innerHTML = '<p class="empty">کالایی یافت نشد.</p>';
        return;
    }
    let html = '';
    assets.slice(0, 100).forEach(asset => { // فعلا 100 تا برای سرعت
        html += `
            <div class="list-item" onclick="alert('کد: ${asset.assetNumber}\\nنام: ${asset.name}\\nتحویل‌گیرنده: ${asset.receiver || '-'}')">
                <div class="item-icon">📦</div>
                <div class="item-content">
                    <h4>${asset.name || 'نامشخص'}</h4>
                    <p>کد: ${asset.assetNumber} | ${asset.location || 'نامشخص'}</p>
                    <p>👤 ${asset.receiver || 'فاقد تحویل‌گیرنده'}</p>
                </div>
            </div>
        `;
    });
    if (assets.length > 100) html += `<p class="empty">نمایش ۱۰۰ کالای اول از ${assets.length} کالا.</p>`;
    container.innerHTML = html;
}

function filterList() {
    const query = document.getElementById('list-search').value.toLowerCase();
    const container = document.getElementById('list-container');
    const filtered = allAssets.filter(a => 
        (a.name && a.name.toLowerCase().includes(query)) ||
        (a.assetNumber && a.assetNumber.toString().includes(query)) ||
        (a.receiver && a.receiver.toLowerCase().includes(query))
    );
    renderList(filtered, container);
}

function populateAssetSelect(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    select.innerHTML = '<option value="">در حال بارگذاری...</option>';
    getAllAssetsFromDB(function(assets) {
        select.innerHTML = '<option value="">-- انتخاب کالا --</option>';
        assets.forEach(asset => {
            const opt = document.createElement('option');
            opt.value = asset.assetNumber;
            opt.text = `${asset.name} (${asset.assetNumber})`;
            select.appendChild(opt);
        });
    });
}

function submitInbound() {
    const assetNumber = document.getElementById('in-asset').value;
    const qty = parseInt(document.getElementById('in-qty').value);
    if (!assetNumber || !qty || qty <= 0) return alert('کالا و تعداد را وارد کنید.');
    saveTransaction(assetNumber, 'IN', qty, document.getElementById('in-date').value, document.getElementById('in-invoice').value, document.getElementById('in-receiver').value, document.getElementById('in-desc').value);
}

function submitOutbound() {
    const assetNumber = document.getElementById('out-asset').value;
    const qty = parseInt(document.getElementById('out-qty').value);
    if (!assetNumber || !qty || qty <= 0) return alert('کالا و تعداد را وارد کنید.');
    saveTransaction(assetNumber, 'OUT', qty, document.getElementById('out-date').value, document.getElementById('out-invoice').value, document.getElementById('out-receiver').value, document.getElementById('out-desc').value);
}

function saveTransaction(assetNumber, type, qty, date, invoice, receiver, desc) {
    const transaction = db.transaction(["transactions"], "readwrite");
    const store = transaction.objectStore("transactions");
    store.add({ assetNumber, type, quantity: qty, date, invoice, receiver, description: desc, timestamp: new Date().getTime() });
    transaction.oncomplete = function() {
        alert(type === 'IN' ? '✅ ورود ثبت شد.' : '✅ خروج ثبت شد.');
        document.getElementById(type === 'IN' ? 'in-qty' : 'out-qty').value = '';
        if (type === 'OUT') updateOutStock();
    };
}

function updateOutStock() {
    const assetNumber = document.getElementById('out-asset').value;
    const stockEl = document.getElementById('out-stock');
    if (!assetNumber) return stockEl.innerText = 'موجودی فعلی: -';
    calculateStock(assetNumber, function(stock) {
        stockEl.innerText = 'موجودی فعلی: ' + stock + ' عدد';
        stockEl.style.color = stock <= 0 ? 'red' : 'blue';
    });
}

function calculateStock(assetNumber, callback) {
    const transaction = db.transaction(["transactions"], "readonly");
    const request = transaction.objectStore("transactions").getAll();
    request.onsuccess = function() {
        let totalIn = 0, totalOut = 0;
        request.result.forEach(tx => {
            if (tx.assetNumber === assetNumber) {
                if (tx.type === 'IN') totalIn += tx.quantity;
                if (tx.type === 'OUT') totalOut += tx.quantity;
            }
        });
        callback(totalIn - totalOut);
    };
}

// 📥 ورود از اکسل
function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('import-status');
    statusEl.innerHTML = '<p style="color:blue;">⏳ در حال خواندن فایل...</p>';

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            let headerRow = -1;
            for (let i = 0; i < jsonData.length; i++) {
                if (jsonData[i] && jsonData[i][3] && jsonData[i][3].toString().includes('شماره دارايي')) {
                    headerRow = i; break;
                }
            }

            if (headerRow === -1) return statusEl.innerHTML = '<p style="color:red;">❌ ردیف هدر پیدا نشد.</p>';

            const transaction = db.transaction(["assets"], "readwrite");
            const store = transaction.objectStore("assets");
            let insertedCount = 0;

            for (let i = headerRow + 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length < 4) continue;
                const assetNumber = row[3] ? row[3].toString().trim() : '';
                if (!assetNumber) continue;

                let name = assetNumber;
                const match = assetNumber.match(/^\d+\s+(.*)/);
                if (match && match[1]) name = match[1].trim();

                store.put({
                    assetNumber: assetNumber,
                    name: name,
                    category: row[0] ? row[0].toString().trim() : '',
                    location: row[9] ? row[9].toString().trim() : '',
                    receiver: row[8] ? row[8].toString().trim() : '',
                    purchaseDate: row[6] ? row[6].toString().trim() : ''
                });
                insertedCount++;
            }

            transaction.oncomplete = function() {
                statusEl.innerHTML = `<p style="color:green; font-weight:bold;">✅ ${insertedCount} رکورد با موفقیت وارد شد!</p>`;
                loadDashboardData();
                document.getElementById('excel-input').value = '';
            };
        } catch (error) {
            statusEl.innerHTML = '<p style="color:red;">❌ خطا در خواندن فایل اکسل.</p>';
        }
    };
    reader.readAsArrayBuffer(file);
}

// 📦 موجودی انبار
function loadInventory() {
    const container = document.getElementById('inventory-container');
    container.innerHTML = '<p class="empty">در حال محاسبه...</p>';
    getAllAssetsFromDB(function(assets) {
        const transaction = db.transaction(["transactions"], "readonly");
        const req = transaction.objectStore("transactions").getAll();
        req.onsuccess = function() {
            const txs = req.result;
            let html = '', count = 0;
            assets.forEach(asset => {
                let totalIn = 0, totalOut = 0;
                txs.forEach(tx => {
                    if (tx.assetNumber === asset.assetNumber) {
                        if (tx.type === 'IN') totalIn += tx.quantity;
                        if (tx.type === 'OUT') totalOut += tx.quantity;
                    }
                });
                const stock = totalIn - totalOut;
                if (stock !== 0 || totalIn > 0) {
                    count++;
                    html += `
                        <div class="list-item">
                            <div class="item-icon" style="background:#f3e5f5; color:#9C27B0;">📦</div>
                            <div class="item-content">
                                <h4>${asset.name}</h4>
                                <p>کد: ${asset.assetNumber} | ورود: ${totalIn} | خروج: ${totalOut}</p>
                            </div>
                            <div class="item-badge ${stock > 0 ? '' : 'red'}">${stock} عدد</div>
                        </div>`;
                }
            });
            container.innerHTML = count === 0 ? '<p class="empty">هنوز تراکنشی ثبت نشده.</p>' : html;
        };
    });
}

// 👥 افراد
function loadPersons() {
    const container = document.getElementById('persons-container');
    container.innerHTML = '<p class="empty">در حال بارگذاری...</p>';
    getAllAssetsFromDB(function(assets) {
        const personMap = {};
        assets.forEach(asset => {
            if (asset.receiver && asset.receiver.trim() !== '') {
                personMap[asset.receiver] = (personMap[asset.receiver] || 0) + 1;
            }
        });
        allPersons = Object.keys(personMap).map(name => ({ name: name, count: personMap[name] })).sort((a, b) => b.count - a.count);
        renderPersons(allPersons, container);
    });
}

function renderPersons(persons, container) {
    if (persons.length === 0) return container.innerHTML = '<p class="empty">شخصی یافت نشد.</p>';
    let html = '';
    persons.forEach(p => {
        html += `
            <div class="list-item" onclick="alert('${p.name}')">
                <div class="item-icon" style="background:#e8eaf6; color:#3F51B5; font-weight:bold; font-size:24px;">${p.name.trim().charAt(0)}</div>
                <div class="item-content"><h4>${p.name}</h4><p>${p.count} قلم کالا</p></div>
            </div>`;
    });
    container.innerHTML = html;
}

function filterPersons() {
    const query = document.getElementById('person-search').value.toLowerCase();
    renderPersons(allPersons.filter(p => p.name.toLowerCase().includes(query)), document.getElementById('persons-container'));
}

// 📊 گزارش‌ها
function loadReports() {
    const statsGrid = document.getElementById('stats-grid');
    const catContainer = document.getElementById('category-stats');
    getAllAssetsFromDB(function(assets) {
        const req = db.transaction(["transactions"], "readonly").objectStore("transactions").getAll();
        req.onsuccess = function() {
            const txs = req.result;
            let totalIn = 0, totalOut = 0;
            txs.forEach(t => { if (t.type === 'IN') totalIn += t.quantity; if (t.type === 'OUT') totalOut += t.quantity; });

            statsGrid.innerHTML = `
                <div class="stat-card blue"><div class="num">${assets.length}</div><div class="label">کل کالاها</div></div>
                <div class="stat-card green"><div class="num">${totalIn - totalOut}</div><div class="label">موجودی فعلی</div></div>
                <div class="stat-card teal"><div class="num">${totalIn}</div><div class="label">کل ورودی</div></div>
                <div class="stat-card red"><div class="num">${totalOut}</div><div class="label">کل خروجی</div></div>`;

            const catMap = {};
            assets.forEach(a => { if (a.category) { const c = a.category.split(' ')[0] + ' ' + (a.category.split(' ')[1] || ''); catMap[c] = (catMap[c] || 0) + 1; } });
            const sortedCats = Object.keys(catMap).map(k => ({ name: k, count: catMap[k] })).sort((a,b) => b.count - a.count).slice(0, 6);
            
            let html = '<h3 style="margin: 0 15px 10px;">کالاها بر اساس طبقه‌بندی</h3>';
            if (sortedCats.length > 0) {
                const max = sortedCats[0].count;
                sortedCats.forEach(c => {
                    html += `<div class="category-bar"><div class="info"><span>${c.name}</span><span>${c.count}</span></div><div class="bar-bg"><div class="bar-fill" style="width: ${(c.count/max)*100}%;"></div></div></div>`;
                });
            } else html += '<p class="empty">اطلاعاتی نیست.</p>';
            catContainer.innerHTML = html;
        };
    });
}

// 📤 خروجی اکسل
function exportToExcel() {
    getAllAssetsFromDB(function(assets) {
        if (assets.length === 0) return alert('داده‌ای وجود ندارد.');
        const data = assets.map(a => ({ 'کد کالا': a.assetNumber, 'نام کالا': a.name, 'طبقه‌بندی': a.category, 'محل استقرار': a.location, 'تحویل‌گیرنده': a.receiver, 'تاریخ خرید': a.purchaseDate }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Assets");
        XLSX.writeFile(wb, `گزارش_انبار_${new Date().getTime()}.xlsx`);
    });
}

function exportInventoryCSV() {
    const req = db.transaction(["transactions"], "readonly").objectStore("transactions").getAll();
    req.onsuccess = function() {
        getAllAssetsFromDB(function(assets) {
            let csv = "\uFEFF" + "کد کالا,نام کالا,تحویل گیرنده,موجودی\n";
            assets.forEach(a => {
                let totalIn = 0, totalOut = 0;
                req.result.forEach(t => { if (t.assetNumber === a.assetNumber) { if (t.type === 'IN') totalIn += t.quantity; if (t.type === 'OUT') totalOut += t.quantity; } });
                if (totalIn > 0 || (totalIn-totalOut) !== 0) csv += `"${a.assetNumber}","${a.name}","${a.receiver || ''}",${totalIn-totalOut}\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `موجودی_${new Date().getTime()}.csv`;
            link.click();
        });
    };
}

// 🗑️ پاک کردن داده‌ها
function clearAllData() {
    if (!confirm('آیا مطمئنید؟ تمام داده‌ها پاک می‌شوند!')) return;
    const tx = db.transaction(["assets", "transactions"], "readwrite");
    tx.objectStore("assets").clear();
    tx.objectStore("transactions").clear();
    tx.oncomplete = function() { alert('✅ پاک شد.'); showPage('home-page'); };
}
