import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import 'dotenv/config';

// Servis hesabı anahtarı koda yazılmaz: .env içindeki FIREBASE_CREDENTIALS yolundaki JSON dosyasından okunur.
const CREDENTIALS_PATH = process.env.FIREBASE_CREDENTIALS || './firebase-credentials.json';
const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || '';

/**
 * Firebase veritabanı işlemlerini yöneten servis sınıfı
 */
export class FirebaseService {
    private db: any;
    private app: any;
    private initialized: boolean = false;

    constructor() {
        try {
            // Firebase Admin SDK'yı başlat
            this.app = initializeApp({
                credential: cert(CREDENTIALS_PATH),
                databaseURL: DATABASE_URL
            });

            // Realtime Database bağlantısını başlat
            this.db = getDatabase(this.app);
            this.initialized = true;
            console.log('✅ Firebase bağlantısı başarılı');
        } catch (error) {
            console.error('❌ Firebase başlatma hatası:', error);
            this.initialized = false;
        }
    }

    /**
     * Tüm ilanları getirir
     */
    async getIlanlar(): Promise<any[]> {
        try {
            if (!this.initialized) {
                console.error('❌ Firebase başlatılmadı!');
                return [];
            }

            console.log('📥 İlanlar alınıyor...');
            
            // Emlak düğümünden başla
            const ref = this.db.ref('/emlakson/kocaeli');
            const snapshot = await ref.once('value');
            const data = snapshot.val();
            
            if (!data) {
                console.log('⚠️ Veri bulunamadı!');
                return [];
            }

            const ilanlar: any[] = [];

            // Her ilçe için
            for (const ilce in data) {
                console.log(`📍 ${ilce} ilçesi işleniyor...`);
                
                // İlçedeki her ilan için
                for (const ilanId in data[ilce]) {
                    const ilan = data[ilce][ilanId];
                    
                    // İlan başlığını oluştur
                    let baslik = `${ilan.odaSayisi || ''} ${ilce} ${ilan.mahalle || ''} `;
                    baslik += `${ilan.metrekare || ''}m² ${ilan.fiyat || ''} TL`;

                    ilanlar.push({
                        id: ilanId,
                        ilce: ilce,
                        baslik: baslik,
                        link: ilan.link || '',
                        iletisimIsmi: ilan.ilanSahibi || '',
                        telefon: ilan.telefon || ''
                    });
                }
            }
            
            console.log(`✅ Toplam ${ilanlar.length} ilan bulundu`);
            return ilanlar;
            
        } catch (error) {
            console.error('❌ Firebase veri çekme hatası:', error);
            return [];
        }
    }

    /**
     * Belirli bir bölgedeki ilanları getirir
     */
    async getBolgeIlanlar(bolge: string): Promise<any[]> {
        try {
            if (!this.initialized) {
                console.error('❌ Firebase başlatılmadı!');
                return [];
            }

            console.log(`📥 ${bolge} bölgesi ilanları alınıyor...`);
            
            const ref = this.db.ref(`/${bolge}`);
            const snapshot = await ref.once('value');
            const data = snapshot.val();
            
            if (!data) {
                console.log('⚠️ Veri bulunamadı!');
                return [];
            }

            const ilanlar: any[] = [];

            // Her ilçe için
            for (const ilce in data) {
                // İlçedeki her ilan için
                for (const ilanId in data[ilce]) {
                    const ilan = data[ilce][ilanId];
                    ilanlar.push({
                        id: ilanId,
                        ilce: ilce,
                        ...ilan
                    });
                }
            }

            return ilanlar;
        } catch (error) {
            console.error('❌ Firebase veri çekme hatası:', error);
            return [];
        }
    }
} 