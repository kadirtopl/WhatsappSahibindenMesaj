import { Client, LocalAuth } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { WhatsAppBot } from './WhatsAppBot';
import { FirebaseService } from './FirebaseService';
import * as path from 'path';
import * as fs from 'fs';

/**
 * WhatsApp bot servisini yöneten ana sınıf
 */
export class WhatsAppBotService {
    private readonly whatsappBot: WhatsAppBot;
    private readonly firebaseService: FirebaseService;
    private readonly client: Client;
    private ilanlar: any[] = [];
    private gonderilmisIlanlar: Set<string> = new Set();
    private readonly SENT_ILANS_FILE = 'gonderilmis_ilanlar.json';
    private readonly STATE_FILE = 'bot_state.json';
    private currentIlanIndex: number = 0;
    private readonly SESSION_PATH = path.join(process.cwd(), '.wwebjs_auth');
    private messageInterval: NodeJS.Timeout | null = null;
    private lastMessageTime: number = 0;
    private readonly WAIT_BETWEEN_MESSAGES = 2 * 60 * 1000; // 2 dakika
    private activeChats: Set<string> = new Set();
    private readonly CHAT_TIMEOUT = 30 * 60 * 1000; // 30 dakika
    private chatTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private lastCheckedIds: Set<string> = new Set();
    private readonly CHECK_INTERVAL = 15 * 1000; // 15 saniye
    private messageTracker: Map<string, number> = new Map();
    private sentMessageLock: Set<string> = new Set(); // Kilitleme mekanizması için yeni özellik
    private isWhatsAppReady: boolean = false;

    constructor() {
        console.log('\n🔄 WhatsApp Bot başlatılıyor...');
        
        this.whatsappBot = new WhatsAppBot();
        this.firebaseService = new FirebaseService();
        
        this.client = new Client({
            authStrategy: new LocalAuth({
                clientId: "whatsapp_bot",
                dataPath: this.SESSION_PATH
            }),
            puppeteer: {
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--no-first-run',
                    '--no-default-browser-check',
                    '--disable-translate',
                    '--disable-sync',
                    '--disable-notifications',
                    '--disable-infobars',
                    '--window-position=0,0',
                    '--ignore-certificate-errors',
                    '--ignore-certificate-errors-spki-list',
                    '--start-maximized',
                    '--window-size=1280,720'
                ],
                executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                defaultViewport: {
                    width: 1280,
                    height: 720
                },
                timeout: 60000,
                handleSIGINT: false,
                handleSIGTERM: false,
                handleSIGHUP: false
            },
            qrMaxRetries: 3,
            restartOnAuthFail: true
        });

        this.loadState();
    }

    private saveSentIlans() {
        try {
            const filePath = path.join(process.cwd(), this.SENT_ILANS_FILE);
            const ilanIds = Array.from(this.gonderilmisIlanlar);
            fs.writeFileSync(filePath, JSON.stringify(ilanIds));
            
            const statePath = path.join(process.cwd(), this.STATE_FILE);
            const state = {
                currentIndex: this.currentIlanIndex,
                lastUpdate: new Date().toISOString()
            };
            fs.writeFileSync(statePath, JSON.stringify(state));
        } catch (error) {
            console.error('❌ Durum kaydedilirken hata:', error);
        }
    }

    private loadState() {
        try {
            const filePath = path.join(process.cwd(), this.SENT_ILANS_FILE);
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                this.gonderilmisIlanlar = new Set(data);
            }

            const statePath = path.join(process.cwd(), this.STATE_FILE);
            if (fs.existsSync(statePath)) {
                const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                this.currentIlanIndex = state.currentIndex || 0;
            }
        } catch {
            this.gonderilmisIlanlar = new Set();
            this.currentIlanIndex = 0;
        }
    }

    private formatPhoneNumber(phone: string): string | null {
        // Telefon numarasını temizle (sadece rakamları al)
        const cleanNumber = phone.replace(/\D/g, '');
        
        // Türkiye formatında numara kontrolü (5xx xxx xx xx)
        if (cleanNumber.length === 10 && cleanNumber.startsWith('5')) {
            return '90' + cleanNumber; // Başına 90 ekle
        }
        
        // Başında 0 varsa kaldır ve 90 ekle
        if (cleanNumber.length === 11 && cleanNumber.startsWith('05')) {
            return '9' + cleanNumber;
        }

        // Başında 90 varsa olduğu gibi bırak
        if (cleanNumber.length === 12 && cleanNumber.startsWith('905')) {
            return cleanNumber;
        }

        return null; // Geçersiz numara
    }

    private getNextUnsentIlan() {
        for (let i = 0; i < this.ilanlar.length; i++) {
            const ilan = this.ilanlar[i];
            if (!ilan?.id) continue;
            if (this.gonderilmisIlanlar.has(ilan.id)) continue;
            
            // Telefon numarası kontrolü
            const phoneNumber = this.formatPhoneNumber(ilan.telefon || '');
            if (!phoneNumber) {
                console.log(`⏭️ Telefon numarası olmayan ilan atlanıyor: ${ilan.id}`);
                this.gonderilmisIlanlar.add(ilan.id); // Bunu da gönderildi olarak işaretle
                continue;
            }

            this.currentIlanIndex = i;
            return { ilan, phoneNumber };
        }
        return null;
    }

    /**
     * WhatsApp bot servisini başlatır
     */
    public async initialize() {
        try {
            await this.client.initialize();
            this.setupEventHandlers();
            await this.loadIlanlar();
            this.startAutoMessaging();
        } catch (error) {
            console.error('❌ Bot başlatılırken hata:', error);
            process.exit(1);
        }
    }

    private canSendMessage(): boolean {
        return Date.now() - this.lastMessageTime >= this.WAIT_BETWEEN_MESSAGES;
    }

    private startChatTimeout(number: string) {
        // Önceki timeout'u temizle
        if (this.chatTimeouts.has(number)) {
            clearTimeout(this.chatTimeouts.get(number));
        }

        // Yeni timeout ayarla
        const timeout = setTimeout(() => {
            this.activeChats.delete(number);
            this.chatTimeouts.delete(number);
        }, this.CHAT_TIMEOUT);

        this.chatTimeouts.set(number, timeout);
    }

    private setupEventHandlers() {
        this.client.on('qr', (qr) => {
            console.clear(); // Ekranı temizle
            console.log('\n📱 WhatsApp QR Kodu:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            qrcode.generate(qr, { small: false }); // QR kodu daha büyük göster
            console.log('\n📱 QR kodu telefonunuzdan WhatsApp > Bağlı Cihazlar > Cihaz Ekle ile tarayın');
            console.log('❗ QR kodu okutulduktan sonra Chrome otomatik kapanacak ve arka planda çalışmaya devam edecek');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        });

        this.client.on('authenticated', () => {
            console.log('\n✅ WhatsApp oturumu doğrulandı!');
        });

        this.client.on('ready', () => {
            console.log('\n✅ WhatsApp hazır!');
            console.log('🤖 Bot arka planda çalışıyor...');
            this.isWhatsAppReady = true;
            // WhatsApp hazır olduktan sonra ilanları yükle
            this.loadIlanlar();
        });

        this.client.on('disconnected', () => {
            console.log('\n⚠️ WhatsApp bağlantısı koptu, yeniden bağlanılıyor...');
            this.client.initialize();
        });

        this.client.on('message', async (message) => {
            try {
                const number = message.from.split('@')[0];
                const messageText = message.body.trim().toLowerCase();

                // Aktif sohbet varsa veya merhaba mesajıysa
                if (this.activeChats.has(number) || messageText === 'merhaba') {
                    // Sohbeti aktif olarak işaretle ve timeout'u başlat
                    this.activeChats.add(number);
                    this.startChatTimeout(number);

                    const response = this.whatsappBot.processMessage(message.body);
                    await this.client.sendMessage(message.from, response);
                }
            } catch (error) {
                // Mesaj işleme hatalarını sessizce geç
            }
        });

        process.on('SIGINT', () => {
            if (this.messageInterval) clearInterval(this.messageInterval);
            this.saveSentIlans();
            process.exit();
        });
    }

    /**
     * Firebase'den ilanları yükler
     */
    private async loadIlanlar() {
        if (!this.isWhatsAppReady) {
            console.log('\n⏳ WhatsApp bağlantısı bekleniyor...');
            return;
        }

        try {
            console.log('\n📊 İlan Kontrolü Başladı');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            const yeniIlanlar = await this.firebaseService.getIlanlar();
            
            // Yeni ilanları kontrol et
            const yeniIlanIds = new Set(yeniIlanlar.map(ilan => ilan.id));
            const oncekiIlanIds = new Set(this.ilanlar.map(ilan => ilan.id));
            
            // Gerçekten yeni olan ilanları bul
            const gercektenYeniIlanlar = yeniIlanlar.filter(ilan => 
                !oncekiIlanIds.has(ilan.id) && 
                !this.gonderilmisIlanlar.has(ilan.id) &&
                !this.lastCheckedIds.has(ilan.id)
            );

            // Yeni ilanlar varsa bildir
            if (gercektenYeniIlanlar.length > 0) {
                console.log(`\n🎯 ${gercektenYeniIlanlar.length} YENİ İLAN BULUNDU!`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                
                // Her yeni ilanı hemen işleme al
                for (const yeniIlan of gercektenYeniIlanlar) {
                    try {
                        console.log(`\n📌 İlan İşleniyor: ${yeniIlan.id}`);
                        console.log('──────────────────────────────────');
                        
                        this.lastCheckedIds.add(yeniIlan.id);
                        const phoneNumber = this.formatPhoneNumber(yeniIlan.telefon || '');
                        
                        if (phoneNumber) {
                            console.log(`📱 Telefon: ${phoneNumber}`);
                            console.log(`📍 Bölge: ${yeniIlan.ilce || '-'}`);
                            console.log(`🔗 Link: ${yeniIlan.link || '-'}`);
                            
                            // Mesaj gönderme işlemini sıraya al
                            await this.sendIlanMessage(yeniIlan, phoneNumber);
                            // Her mesaj arasında kısa bir bekleme
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        } else {
                            console.log(`⚠️  Geçersiz telefon numarası: ${yeniIlan.id}`);
                            this.gonderilmisIlanlar.add(yeniIlan.id);
                        }
                    } catch (error) {
                        console.error(`\n❌ İlan işlenirken hata (${yeniIlan.id}):`, error);
                        // Hata durumunda ilanı tekrar denemek için lastCheckedIds'den çıkar
                        this.lastCheckedIds.delete(yeniIlan.id);
                    }
                }
            } else {
                console.log('\nℹ️  Yeni ilan bulunamadı.');
            }

            // İlan listesini güncelle
            this.ilanlar = yeniIlanlar;
            
            // lastCheckedIds'i temizle (24 saatten eski ID'leri sil)
            const birGunOnce = Date.now() - (24 * 60 * 60 * 1000);
            this.lastCheckedIds.forEach(id => {
                const ilan = this.ilanlar.find(i => i.id === id);
                if (!ilan || new Date(ilan.tarih).getTime() < birGunOnce) {
                    this.lastCheckedIds.delete(id);
                }
            });

            console.log('\n📊 İlan Kontrolü Tamamlandı');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        } catch (error) {
            console.error('\n❌ İlanlar yüklenirken hata:', error);
        }
    }

    private async sendIlanMessage(ilan: any, phoneNumber: string) {
        if (!this.client.pupPage?.isClosed()) {
            const lockKey = `${phoneNumber}_${ilan.id}`;
            
            try {
                // Kilitleme kontrolü
                if (this.sentMessageLock.has(lockKey)) {
                    console.log(`\n🔒 ${phoneNumber} numarasına mesaj gönderme işlemi devam ediyor. Atlanıyor.`);
                    return;
                }

                // Son mesaj gönderme zamanını kontrol et
                const lastMessageTime = this.messageTracker.get(phoneNumber);
                const now = Date.now();
                
                // Son 30 saniye içinde mesaj gönderilmişse, tekrar gönderme
                if (lastMessageTime && (now - lastMessageTime) < 30 * 1000) {
                    console.log(`\n⚠️  ${phoneNumber} numarasına çok kısa süre önce mesaj gönderildi. Atlanıyor.`);
                    this.gonderilmisIlanlar.add(ilan.id);
                    this.saveSentIlans();
                    return;
                }

                // Kilidi ekle
                this.sentMessageLock.add(lockKey);

                // WhatsApp'ın hazır olduğundan emin ol
                if (!this.client.info) {
                    console.log('\n⏳ WhatsApp bağlantısı bekleniyor...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }

                console.log('\n📤 Mesaj Gönderiliyor...');
                console.log('──────────────────────────────────');

                this.whatsappBot.setIlanData(ilan, ilan.link || '');
                const welcomeMessage = this.whatsappBot.processMessage('merhaba');
                
                // Mesaj göndermeyi dene
                await this.client.sendMessage(`${phoneNumber}@c.us`, welcomeMessage);
                
                // Mesaj gönderme zamanını kaydet
                this.messageTracker.set(phoneNumber, now);
                
                // Başarılı gönderimi kaydet
                this.gonderilmisIlanlar.add(ilan.id);
                this.saveSentIlans();
                this.lastMessageTime = now;

                // Sohbeti aktif olarak işaretle
                this.activeChats.add(phoneNumber);
                this.startChatTimeout(phoneNumber);

                console.log(`\n✅ MESAJ BAŞARIYLA GÖNDERİLDİ!`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`📱 Numara: ${phoneNumber}`);
                console.log(`📍 Bölge: ${ilan.ilce || '-'}`);
                console.log(`🔗 Link: ${ilan.link || '-'}`);
                console.log(`⏰ Zaman: ${new Date().toLocaleTimeString()}`);

            } catch (error) {
                console.error(`\n❌ Mesaj gönderilirken hata (${ilan.id}):`, error);
                console.log('🔄 Yeniden deneme başlatılıyor...');
                
                // Hata durumunda 3 kez deneme yap
                for (let i = 0; i < 3; i++) {
                    try {
                        console.log(`\n🔄 ${i + 1}. DENEME YAPILIYOR...`);
                        console.log('──────────────────────────────────');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        
                        this.whatsappBot.setIlanData(ilan, ilan.link || '');
                        const welcomeMessage = this.whatsappBot.processMessage('merhaba');
                        await this.client.sendMessage(`${phoneNumber}@c.us`, welcomeMessage);
                        
                        console.log(`\n✅ ${i + 1}. DENEME BAŞARILI!`);
                        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                        this.gonderilmisIlanlar.add(ilan.id);
                        this.saveSentIlans();
                        break;
                    } catch (retryError) {
                        console.error(`\n❌ ${i + 1}. deneme başarısız:`, retryError);
                        if (i === 2) { // Son deneme de başarısız olduysa
                            console.log('\n⚠️  Tüm denemeler başarısız oldu.');
                            this.gonderilmisIlanlar.add(ilan.id);
                            this.saveSentIlans();
                        }
                    }
                }
            } finally {
                // Her durumda kilidi kaldır
                this.sentMessageLock.delete(lockKey);
            }
        }
    }

    private startAutoMessaging() {
        console.log('\n🚀 BOT BAŞLATILDI');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📊 Toplam İlan: ${this.ilanlar.length}`);
        console.log(`⏱️  Kontrol Aralığı: ${this.CHECK_INTERVAL / 1000} saniye`);
        console.log('👀 Yeni ilanlar için kontrol yapılıyor...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Her 15 saniyede bir kontrol et
        this.messageInterval = setInterval(async () => {
            try {
                await this.loadIlanlar();
            } catch (error) {
                console.error('\n❌ Otomatik kontrol sırasında hata:', error);
            }
        }, this.CHECK_INTERVAL);
    }
} 