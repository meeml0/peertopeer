// WhatsApp tarzı tarih ve gün formatlayıcı utility fonksiyonları

/**
 * Mesaj balonlarının üzerinde gösterilen gün/tarih ayracı için (ChatScreen gün başlığı)
 * - Bugün ise: "Bugün"
 * - Dün ise: "Dün"
 * - Son 7 gün içindeyse: "Pazartesi", "Salı", vb.
 * - 7 günden eskiyse: "15.10.2026"
 */
export const formatMessageDateHeader = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();

  // Saatleri sıfırlayarak gün bazlı karşılaştırma yapalım
  const targetDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = todayOnly.getTime() - targetDateOnly.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'Bugün';
  }

  if (diffDays === 1) {
    return 'Dün';
  }

  if (diffDays > 1 && diffDays < 7) {
    const daysTr = [
      'Pazar',
      'Pazartesi',
      'Salı',
      'Çarşamba',
      'Perşembe',
      'Cuma',
      'Cumartesi',
    ];
    return daysTr[date.getDay()];
  }

  // 1 haftadan (7 günden) eskiyse: GG.AA.YYYY
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
};

/**
 * Sohbet listesinde (UsersScreen) son mesaj zamanı için:
 * - Bugün ise: Saat (14:30)
 * - Dün ise: "Dün"
 * - 1 hafta içindeyse: "Pazartesi", "Salı", vb.
 * - 1 haftadan eskiyse: "15.10.2026"
 */
export const formatChatListTime = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();

  const targetDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffTime = todayOnly.getTime() - targetDateOnly.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (diffDays === 1) {
    return 'Dün';
  }

  if (diffDays > 1 && diffDays < 7) {
    const daysTr = [
      'Pazar',
      'Pazartesi',
      'Salı',
      'Çarşamba',
      'Perşembe',
      'Cuma',
      'Cumartesi',
    ];
    return daysTr[date.getDay()];
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
};

/**
 * İki mesajın aynı günde olup olmadığını kontrol eder (Tarih ayracı çizmek için)
 */
export const isSameDay = (date1String: string, date2String: string): boolean => {
  if (!date1String || !date2String) return false;
  const d1 = new Date(date1String);
  const d2 = new Date(date2String);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};
