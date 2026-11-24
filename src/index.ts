import { WhatsAppBotService } from './services/WhatsAppBotService';

/**
 * Ana uygulama başlangıç noktası
 */
async function main() {
	try {
		const whatsappBot = new WhatsAppBotService();
		await whatsappBot.initialize();
	} catch (error) {
		console.error('❌ Uygulama hatası:', error);
		process.exit(1);
	}
}

main();