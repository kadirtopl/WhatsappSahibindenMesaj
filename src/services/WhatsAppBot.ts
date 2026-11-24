import { Client } from 'whatsapp-web.js';

export class WhatsAppBot {
    private currentStep: number = 0;
    private userData: any = {};
    private ilanData: any = null;
    private link: string = '';
    private readonly TARGET_NUMBER = process.env.TARGET_NUMBER || ''; // .env: 90XXXXXXXXXX
    private client: Client;

    constructor() {
        this.client = new Client({
            puppeteer: {
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                headless: true,
                executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
            }
        });
    }

    // İlan verilerini set eden method
    public setIlanData(ilan: any, link: string) {
        this.ilanData = ilan;
        this.link = link;
    }

    public getIlanMessage(): string {
        if (!this.ilanData || !this.link) {
            return "❌ İlan bilgisi ya da bağlantısı bulunamadı!";
        }

        let message = `🏠 *${this.ilanData.baslik || 'Yeni İlan'}*\n\n`;
        if (this.ilanData.ilce) message += `📍 ${this.ilanData.ilce}\n`;
        if (this.ilanData.fiyat) message += `💰 ${this.ilanData.fiyat}\n`;
        if (this.ilanData.metrekare) message += `📏 ${this.ilanData.metrekare}m²\n`;
        if (this.ilanData.odaSayisi) message += `🛏️ ${this.ilanData.odaSayisi}\n`;
        message += `\n🔗 ${this.link}\n\n`;
        message += `📱 Detaylı bilgi için:\n`;
        message += `1️⃣ Yeni ilan göster\n`;
        message += `2️⃣ Farklı bölge göster\n`;
        message += `3️⃣ Farklı fiyat aralığı göster\n`;
        message += `❌ Çıkmak için "Çıkış" yazın`;

        return message;
    }

    // Gelen mesajları işleyen ana method
    public processMessage(message: string): string {
        const lower = message.toLowerCase().trim();

        if (lower.includes("çıkış")) return this.handleExit();
        if (lower.includes("canlı destek")) return this.handleLiveSupport();
        if (lower.includes("merhaba")) return this.handleWelcome();

        if (lower === "1") return this.handlePropertyType("Konut");
        if (lower === "2") return this.handlePropertyType("Dükkan");
        if (lower === "3") return this.handlePropertyType("Ofis");
        if (lower === "4") return this.handleNoLongerInterested();

        switch (this.currentStep) {
            case 1:
                this.userData.bolge = message;
                this.currentStep++;
                return "💰 Kiralamayı düşündüğünüz yaklaşık fiyat aralığı nedir?";
            case 2:
                this.userData.fiyat = message;
                this.currentStep++;
                return this.handleFinalRouting();
            default:
                return this.handleWelcome();
        }
    }

    private async sendToTargetNumber(): Promise<void> {
        try {
            const message = `Yeni Müşteri Bilgileri:\n
Mülk Türü: ${this.userData.tip}
Bölge: ${this.userData.bolge}
Fiyat: ${this.userData.fiyat}
İlan Başlığı: ${this.ilanData?.baslik || 'Bilgi yok'}
İlan Linki: ${this.link}`;

            await this.client.sendMessage(`${this.TARGET_NUMBER}@c.us`, message);
            console.log('Bilgiler hedef numaraya gönderildi.');
        } catch (error) {
            console.error('Hedef numaraya mesaj gönderilirken hata oluştu:', error);
        }
    }

    // Karşılama mesajını oluşturan method
    private handleWelcome(): string {
        this.currentStep = 0;
        this.userData = {};

        const iletisimIsmi = this.ilanData?.iletisimIsmi?.split(' ')[0] || 'Değerli Mülk Sahibi';

        return `👋 Merhaba ${iletisimIsmi},

📌 İlanınızı gördük ve çok beğendik! ${this.link}
Sizinle kısaca tanışmak istedik.

🎯 Remax Dream olarak size çok daha hızlı ve net bir sonuç alabiliriz.

✨ Çünkü biz sadece ilan açmıyoruz…  
📊 Doğru kiracıyı, doğru yöntemlerle, doğru anda buluşturuyoruz.

📌 Kocaeli'de 600'den fazla aktif portföyle  
🏆 Google'da 4.9 memnuniyet puanımızla  
🚀 Ve yalnızca bu ay **51 kiralama** başarısıyla

Remax Dream olarak fark yaratıyoruz!

💡 Reklamlarımız yapay zekâ destekli, sosyal medya ile destekleniyor  
🔍 Kiracıları analiz ediyoruz (adli sicil, banka puanı, geçmiş kira performansı)  
⏱️ Süreçte sizi yormadan, hızlı ve net ilerliyoruz

🧠 Size küçük bir veri paylaşalım mı?

📌 İlanlarımızın %76'sı **ilk 2 hafta içinde** kiralanıyor.  
📌 Sizden sadece **40 gün** istiyoruz — ama çoğu ilan bu süre dolmadan sonuçlanıyor!

🎯 Gerçekten fark yaratmak istiyorsanız, sadece 1 dakikanızı ayırın. Gerisini biz halledelim.

📋 Kiraya vermek istediğiniz mülk türü nedir?  
1️⃣ Konut  
2️⃣ Dükkan  
3️⃣ Ofis  
4️⃣ Kiraya verdim / vazgeçtim  

❌ Çıkmak isterseniz "Çıkış" yazabilirsiniz  
💬 Canlı destek için "Canlı Destek" yazmanız yeterli`;
    }

    // Çıkış mesajını oluşturan method
    private handleExit(): string {
        return "😊 Şimdilik hoşça kalın. Dilediğinizde sadece 'Merhaba' yazarak tekrar başlayabilirsiniz.";
    }

    // Canlı destek mesajını oluşturan method
    private handleLiveSupport(): string {
        return "👩‍💼 Şimdi sizi canlı destek ekibimize yönlendiriyoruz... Lütfen birkaç saniye bekleyin.";
    }

    // Mülk tipi seçimini işleyen method
    private handlePropertyType(type: string): string {
        this.userData.tip = type;
        this.currentStep = 1;
        return `📍 ${type} mülkünüz hangi bölgede yer alıyor?`;
    }

    // İlgilenmeme durumunu işleyen method
    private handleNoLongerInterested(): string {
        const iletisimIsmi = this.ilanData?.iletisimIsmi?.split(' ')[0] || 'Değerli Mülk Sahibi';

        return `👏 Kararınıza saygı duyuyoruz ${iletisimIsmi}.

Ama küçük bir not düşelim:

📌 Remax Dream olarak sadece bu ay 51 kiralama yaptık.  
%95 başarı oranımızla, doğru reklam – doğru kiracı – hızlı sonuç sağlıyoruz.

📸 Profesyonel fotoğraf + video  
📲 Yapay zekâ destekli reklam + sosyal medya yayını  
📑 Kira sözleşmesi + hukuki danışmanlık  
🔍 Kiracı analizi: adli sicil, banka skoru, kira geçmişi

İleride ${this.ilanData?.baslik || "mülkünüzü"} yeniden değerlendirmek isterseniz, biz hep buradayız.

✉️ 'Merhaba' yazarak dilediğiniz zaman tekrar başlayabilirsiniz.

Remax'ta işler hızlı işler! 🚀`;
    }

    // Final yönlendirme mesajını oluşturan method
    private handleFinalRouting(): string {
        return `✅ Bilgilerinizi aldık, teşekkür ederiz:

🏠 Mülk Türü: ${this.userData.tip}  
📍 Bölge: ${this.userData.bolge}  
💰 Beklenen Kira: ${this.userData.fiyat}

Şimdi sizi ${this.userData.bolge} bölgesinde uzman olan danışmanımıza aktarıyoruz.
Danışmanımız en kısa sürede sizinle iletişime geçecektir. 📞

🎯 Remax Dream olarak bu ay **51 kiralama** gerçekleştirdik.  
%95 başarı oranı, 40 gün hedef süremiz var ama çoğu ilan ilk 2 haftada sonuçlanıyor!

📸 Profesyonel fotoğraf  
🎥 Video + drone çekimleri  
📲 Sosyal medya & ilan platformları  
🔐 Güvenli kira sözleşmeleri  
👤 Kiracı seçimi ve analiz desteği

Remax Dream hız timi burada, işi mutfakta çözüyoruz! 👨‍🍳`;
    }
} 