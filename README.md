ALTAY

Minimal, hafif ve kontrollü RAM kullanımı hedefleyen özel bir Electron tabanlı tarayıcı.

🎯 Amaç

ALTAY’ın amacı:

Minimal arayüz

Gereksiz Electron overhead’inden kaçınmak

Kontrollü RAM kullanımı

Basit ama temiz tab yönetimi

BrowserView tab mimarisi ile izole sekmeler

🧠 Mimari

ALTAY aşağıdaki yapıyı kullanır:

Electron

BrowserWindow

BrowserView (her sekme için ayrı instance)

Renderer UI (HTML + CSS + JS)

main.js → sekme ve BrowserView kontrolü

Sekmeler iframe ile değil, doğrudan BrowserView ile oluşturulur.

Bu sayede:

Her sekme izole çalışır

Renderer şişmez

Daha stabil hafıza davranışı elde edilir

🧩 Tab Yönetimi

Sekmeler şu kurallara göre çalışır:

Uygulama açıldığında tam olarak 1 sekme oluşturulur

Kullanıcı "+" ile yeni sekme açabilir

En az 1 sekme her zaman açık kalır

Aktif sekme değiştirildiğinde:

Eski BrowserView kaldırılır

Yeni BrowserView eklenir

Bounds güncellenir

Bu yaklaşım:

Aynı anda gereksiz view render edilmesini engeller

RAM kullanımını kontrol altında tutar

Görsel çakışmaları önler

💾 RAM Kullanımı

Electron doğası gereği Chromium motoru kullanır.
Bu nedenle:

Her BrowserView ayrı render süreci kullanır

Her sekme ortalama 80–150MB RAM tüketebilir (açılan siteye bağlı)

ALTAY şunları yaparak gereksiz tüketimi azaltmayı hedefler:

Aynı anda yalnızca aktif BrowserView’in görünür olması

Sekme state duplication olmaması

Çift createTab çağrılarının engellenmesi

Minimal preload kullanımı

Gereksiz IPC spam olmaması

⚙️ Performans Felsefesi

ALTAY bir Chrome alternatifi olmaya çalışmaz.
Amaç:

Kontrol

Minimalizm

Düşük UI karmaşıklığı

Öngörülebilir bellek davranışı

📐 Sidebar Sistemi

60px collapsed

200px hover expand

CSS transition ile animasyon

BrowserView bounds minimum 60px'e göre hesaplanır

Layout shift problemi engellenmiştir

🚀 Gelecek İyileştirmeler

Inactive tab suspension

Background tab throttling

Memory cleanup hooks

Optional lightweight mode

GPU acceleration toggling

⚠️ Not

Electron uygulamaları doğal olarak native tarayıcılara göre daha fazla RAM kullanır.
ALTAY bu durumu optimize etmeye çalışır ancak tamamen ortadan kaldıramaz.

🛠 Geliştirici Notu

Bu proje:

Öğrenme amaçlı

Minimal mimari denemesi

Hafif tarayıcı deneysel altyapısı

olarak tasarlanmıştır.`
