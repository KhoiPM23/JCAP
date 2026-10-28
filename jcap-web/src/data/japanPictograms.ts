// Biểu tượng (pictogram) đặc trưng của từng tỉnh, dùng bộ EXPERIENCE JAPAN PICTOGRAMS.
// Tên tiếng Nhật lấy đúng theo tên chính thức trên https://experience-japan.info (trang /pict/{id}).
//
// Điều khoản của bộ icon (Terms of use, Nippon Design Center): dùng miễn phí kể cả thương mại;
// được đổi màu/kích thước nhưng KHÔNG được biến dạng hình; không phân phối lại file icon;
// không link trực tiếp tới file trên trang của họ (nên icon được lưu trong public/pictograms).
// File icon được chép vào public/pictograms bằng scripts/copy-pictograms.mjs.
//
// Nguyên tắc gán: chỉ gán icon gắn với một địa phương rõ ràng (địa danh, di sản, lễ hội, đặc sản
// nổi tiếng nhất của tỉnh). Icon chung (sushi, chùa, ramen...) không gán. Icon trải trên nhiều tỉnh
// thì gán cho tất cả các tỉnh đó.

export type PictogramKind = 'landmark' | 'nature' | 'heritage' | 'culture' | 'food';

export interface Pictogram {
  /** Tên file (không có đuôi) trong bộ icon, cũng là đường dẫn /pict/{id viết thường} trên trang gốc */
  id: string;
  nameJp: string;
  nameVi: string;
  kind: PictogramKind;
}

export const PICTOGRAM_KIND_LABEL: Record<PictogramKind, string> = {
  landmark: 'Địa danh',
  nature: 'Thiên nhiên',
  heritage: 'Di sản',
  culture: 'Văn hóa',
  food: 'Đặc sản',
};

export const PICTOGRAM_CREDIT = {
  text: 'Biểu tượng: Nippon Design Center / EXPERIENCE JAPAN PICTOGRAMS',
  short: 'Biểu tượng © NDC',
  url: 'https://experience-japan.info',
};

const P = (id: string, nameJp: string, nameVi: string, kind: PictogramKind): Pictogram => ({ id, nameJp, nameVi, kind });

export const PICTOGRAMS: Record<string, Pictogram> = Object.fromEntries(
  [
    // ---- Địa danh (P_) ----
    P('P_shiretoko', '知床', 'Bán đảo Shiretoko', 'nature'),
    P('P_lake-mashu', '摩周湖', 'Hồ Mashu', 'nature'),
    P('P_nebuta', 'ねぶた祭', 'Lễ hội Nebuta', 'culture'),
    P('P_chuson-ji', '中尊寺', 'Chùa Chuson-ji', 'landmark'),
    P('P_matsushima', '松島', 'Vịnh Matsushima', 'nature'),
    P('P_namahage', 'なまはげ', 'Namahage', 'culture'),
    P('P_ginzan', '銀山温泉', 'Suối nước nóng Ginzan', 'landmark'),
    P('P_sazaedo', '会津さざえ堂', 'Chùa Sazaedo (Aizu)', 'landmark'),
    P('P_kashima-jingu', '鹿島神宮', 'Đền Kashima', 'landmark'),
    P('P_kairakuen', '偕楽園', 'Vườn Kairakuen', 'landmark'),
    P('P_nikko-toshogu', '日光東照宮', 'Đền Nikko Toshogu', 'landmark'),
    P('P_tomioka', '富岡製糸場', 'Xưởng tơ Tomioka', 'heritage'),
    P('P_kawagoe', '川越', 'Phố cổ Kawagoe', 'landmark'),
    P('P_shinshoji', '成田山新勝寺', 'Chùa Naritasan Shinsho-ji', 'landmark'),
    P('P_tokyo-tower', '東京タワー', 'Tháp Tokyo', 'landmark'),
    P('P_tokyo-skytree', '東京スカイツリー', 'Tháp Tokyo Skytree', 'landmark'),
    P('P_asakusa', '浅草', 'Asakusa', 'landmark'),
    P('P_imperial-palace', '皇居', 'Hoàng cung', 'landmark'),
    P('P_meiji-jingu', '明治神宮', 'Đền Minh Trị (Meiji Jingu)', 'landmark'),
    P('P_kabukiza', '歌舞伎座', 'Nhà hát Kabuki-za', 'culture'),
    P('P_national-diet-building', '国会議事堂', 'Tòa nhà Quốc hội', 'landmark'),
    P('P_ginza', '銀座', 'Ginza', 'landmark'),
    P('P_akihabara', '秋葉原', 'Akihabara', 'landmark'),
    P('P_harajuku', '原宿', 'Harajuku', 'landmark'),
    P('P_toyosu-market', '豊洲市場', 'Chợ Toyosu', 'landmark'),
    P('P_kokugikan', '両国国技館', 'Nhà thi đấu Sumo Ryogoku Kokugikan', 'culture'),
    P('P_budokan', '日本武道館', 'Nippon Budokan', 'landmark'),
    P('P_tokyo-dome', '東京ドーム', 'Tokyo Dome', 'landmark'),
    P('P_national-stadium', '国立競技場', 'Sân vận động Quốc gia', 'landmark'),
    P('P_kamakura', '鎌倉大仏', 'Tượng Đại Phật Kamakura', 'landmark'),
    P('P_tsurugaoka-hachimangu', '鶴岡八幡宮', 'Đền Tsurugaoka Hachimangu', 'landmark'),
    P('P_enoshima-island', '江の島', 'Đảo Enoshima', 'nature'),
    P('P_yokohama-chinatown', '横浜中華街', 'Phố Tàu Yokohama', 'landmark'),
    P('P_yokohama-brick-warehouse', '横浜赤レンガ倉庫', 'Kho gạch đỏ Yokohama', 'landmark'),
    P('P_sado-island', '佐渡', 'Đảo Sado', 'nature'),
    P('P_tateyama', '立山', 'Núi Tateyama', 'nature'),
    P('P_kurobe-gorge', '黒部峡谷', 'Hẻm núi Kurobe', 'nature'),
    P('P_kenrokuen', '兼六園', 'Vườn Kenrokuen', 'landmark'),
    P('P_tojinbo', '東尋坊', 'Vách đá Tojinbo', 'nature'),
    P('P_sabae', '鯖江', 'Sabae (thủ phủ gọng kính)', 'culture'),
    P('P_fuji-five-lakes', '富士五湖', 'Ngũ hồ Phú Sĩ', 'nature'),
    P('P_mt-fuji', '富士山', 'Núi Phú Sĩ', 'nature'),
    P('P_matsumoto-castle', '松本城', 'Thành Matsumoto', 'landmark'),
    P('P_jigokudani', '地獄谷野猿公苑', 'Công viên khỉ Jigokudani', 'nature'),
    P('P_shirakawa-go', '白川郷', 'Làng cổ Shirakawa-go', 'heritage'),
    P('P_miho-no-matsubara', '三保の松原', 'Rừng thông Miho no Matsubara', 'nature'),
    P('P_nagoya-castle', '名古屋城', 'Thành Nagoya', 'landmark'),
    P('P_ise-jingu', '伊勢神宮', 'Đền Ise', 'landmark'),
    P('P_enryakuji', '比叡山延暦寺', 'Chùa Enryaku-ji (núi Hiei)', 'landmark'),
    P('P_rokuonji', '鹿苑寺（金閣寺）', 'Chùa Vàng (Kinkaku-ji)', 'landmark'),
    P('P_fushimi-inari', '伏見稲荷大社', 'Đền Fushimi Inari', 'landmark'),
    P('P_kiyomizu', '清水寺', 'Chùa Kiyomizu', 'landmark'),
    P('P_ginkaku-ji', '慈照寺（銀閣寺）', 'Chùa Bạc (Ginkaku-ji)', 'landmark'),
    P('P_ama-no-hashidate', '天橋立', 'Doi cát Amanohashidate', 'nature'),
    P('P_tsutenkaku-tower', '通天閣', 'Tháp Tsutenkaku', 'landmark'),
    P('P_tower-of-the-sun', '太陽の塔', 'Tháp Mặt Trời', 'landmark'),
    P('P_abeno-harukasu', 'あべのハルカス', 'Tòa nhà Abeno Harukas', 'landmark'),
    P('P_tomb-emperor-nintoku', '大山古墳（仁徳天皇陵）', 'Lăng Thiên hoàng Nintoku (Daisen Kofun)', 'heritage'),
    P('P_himeji-castle', '姫路城', 'Thành Himeji', 'heritage'),
    P('P_koshien', '甲子園', 'Sân bóng chày Koshien', 'landmark'),
    P('P_nara-park', '奈良公園', 'Công viên Nara', 'landmark'),
    P('P_todaiji', '東大寺大仏', 'Tượng Đại Phật chùa Todai-ji', 'landmark'),
    P('P_horyuji', '法隆寺', 'Chùa Horyu-ji', 'heritage'),
    P('P_nachi-falls', '那智の滝', 'Thác Nachi', 'nature'),
    P('P_tottori-sand-dunes', '鳥取砂丘', 'Đồi cát Tottori', 'nature'),
    P('P_izumo', '出雲大社', 'Đền Izumo Taisha', 'landmark'),
    P('P_korakuen', '岡山後楽園', 'Vườn Korakuen (Okayama)', 'landmark'),
    P('P_seto-bridge', '瀬戸大橋', 'Cầu Seto Ohashi', 'landmark'),
    P('P_itsukushima', '厳島神社', 'Đền Itsukushima', 'heritage'),
    P('P_atomic-bomb-dome', '原爆ドーム', 'Mái vòm Bom nguyên tử', 'heritage'),
    P('P_hiroshima-peace-park', '広島平和記念公園', 'Công viên Tưởng niệm Hòa bình Hiroshima', 'landmark'),
    P('P_senkoku-ji', '千光寺', 'Chùa Senko-ji (Onomichi)', 'landmark'),
    P('P_kintaikyo', '錦帯橋', 'Cầu Kintai', 'landmark'),
    P('P_kotohiragu', '金刀比羅宮', 'Đền Kotohira-gu (Konpira)', 'landmark'),
    P('P_dogo-onsen', '道後温泉', 'Suối nước nóng Dogo', 'landmark'),
    P('P_shimanto-river', '四万十川', 'Sông Shimanto', 'nature'),
    P('P_dazaifu-tenmangu', '太宰府天満宮', 'Đền Dazaifu Tenmangu', 'landmark'),
    P('P_karatsu-float', '唐津くんち', 'Lễ hội Karatsu Kunchi', 'culture'),
    P('P_yoshinogari', '吉野ヶ里遺跡', 'Di tích Yoshinogari', 'heritage'),
    P('P_nagasaki-peace-park', '長崎平和公園', 'Công viên Hòa bình Nagasaki', 'landmark'),
    P('P_oura-church', '大浦天主堂', 'Nhà thờ Oura', 'heritage'),
    P('P_amakusa', '天草諸島', 'Quần đảo Amakusa', 'nature'),
    P('P_yufuin', '湯布院', 'Yufuin', 'landmark'),
    P('P_takachiho', '高千穂峡', 'Hẻm núi Takachiho', 'nature'),
    P('P_yakushima', '屋久島', 'Đảo Yakushima', 'nature'),
    P('P_tanegashima', '種子島', 'Đảo Tanegashima', 'nature'),
    P('P_shurijo', '首里城', 'Thành Shuri', 'heritage'),

    // ---- Thiên nhiên / di sản / văn hóa gắn với địa phương (N_, H_, C_) ----
    P('N_shirakami', '白神山地', 'Dãy núi Shirakami', 'nature'),
    P('N_fukuroda-falls', '袋田の滝', 'Thác Fukuroda', 'nature'),
    P('N_kegon-falls', '華厳の滝', 'Thác Kegon', 'nature'),
    P('N_kusatsu', '草津温泉', 'Suối nước nóng Kusatsu', 'nature'),
    P('N_le-corbusier', 'ル・コルビジェの建築作品', 'Công trình của Le Corbusier (Bảo tàng Mỹ thuật Phương Tây Quốc gia)', 'heritage'),
    P('N_suwako', '諏訪湖', 'Hồ Suwa', 'nature'),
    P('H_kyu-kaichigakkou-kousha', '旧開智学校校舎', 'Trường cổ Kaichi', 'heritage'),
    P('N_gero', '下呂温泉', 'Suối nước nóng Gero', 'nature'),
    P('N_kiisanchi', '紀伊山地の霊場と参詣道', 'Thánh địa và đường hành hương dãy núi Kii', 'heritage'),
    P('N_arima', '有馬温泉', 'Suối nước nóng Arima', 'nature'),
    P('H_iwamiginzan', '石見銀山遺跡', 'Mỏ bạc Iwami Ginzan', 'heritage'),
    P('C_awa-dance', '阿波おどり', 'Điệu múa Awa Odori', 'culture'),
    P('H_yosakoi', 'よさこい', 'Điệu múa Yosakoi', 'culture'),
    P('H_munakata-okinoshima', '宗像・沖ノ島', 'Đảo thiêng Okinoshima (Munakata)', 'heritage'),
    P('H_gunkanjima', '軍艦島（端島）', 'Đảo Gunkanjima (Hashima)', 'heritage'),
    P('H_dejima', '出島', 'Đảo Dejima', 'heritage'),
    P('H_glovergarden', 'グラバー園', 'Vườn Glover', 'heritage'),
    P('N_hausutenbosu', 'ハウステンボス', 'Huis Ten Bosch', 'landmark'),
    P('N_kujukushima', '九十九島', 'Quần đảo Kujukushima', 'nature'),
    P('N_fugendake', '普賢岳', 'Núi Fugen (Unzen)', 'nature'),
    P('N_amami-oshima_tokunoshima_iriomotejima', '奄美大島・徳之島・西表島', 'Amami Oshima, Tokunoshima và Iriomote', 'nature'),

    // ---- Đặc sản (F_): chỉ những món gắn rõ với một tỉnh ----
    P('F_kelp', '昆布', 'Tảo bẹ kombu', 'food'),
    P('F_apple', 'りんご', 'Táo', 'food'),
    P('F_noodles-wanko-soba', 'わんこそば', 'Mì Wanko soba', 'food'),
    P('F_sasakama', '笹かまぼこ', 'Chả cá Sasa-kamaboko', 'food'),
    P('F_cherry', 'さくらんぼ', 'Anh đào', 'food'),
    P('F_strawberry', 'いちご', 'Dâu tây', 'food'),
    P('F_peanut', '落花生', 'Lạc (đậu phộng)', 'food'),
    P('F_sasa-dango', '笹団子', 'Bánh Sasa-dango', 'food'),
    P('F_kakinotane', '柿の種', 'Bánh gạo Kaki no tane', 'food'),
    P('F_squid-firefly', 'ほたるいか', 'Mực đom đóm', 'food'),
    P('F_grape', 'ぶどう', 'Nho', 'food'),
    P('F_peach', '桃', 'Đào', 'food'),
    P('F_oyaki', 'おやき', 'Bánh Oyaki', 'food'),
    P('F_lobster', '伊勢海老', 'Tôm hùm Ise', 'food'),
    P('F_clam-shijimi', 'しじみ', 'Hến Shijimi', 'food'),
    P('F_kibi-dango', 'きびだんご', 'Bánh Kibi-dango', 'food'),
    P('F_momiji-manju', 'もみじ饅頭', 'Bánh Momiji-manju', 'food'),
    P('F_oyster', '牡蠣', 'Hàu', 'food'),
    P('F_pufferfish', 'ふぐ', 'Cá nóc', 'food'),
    P('F_olive', 'オリーブ', 'Ô liu', 'food'),
    P('F_spicy-cod-roe', '明太子', 'Trứng cá tuyết cay Mentaiko', 'food'),
    P('F_castella', 'カステラ', 'Bánh Castella', 'food'),
    P('F_karasumi', 'からすみ', 'Trứng cá đối khô Karasumi', 'food'),
  ].map((p) => [p.id, p]),
);

/**
 * Icon của từng tỉnh (theo mã JIS). Icon đầu tiên là biểu tượng chính, hiện trên bản đồ cạnh tên tỉnh.
 * Thứ tự: địa danh/thiên nhiên/di sản trước, đặc sản sau.
 */
export const PREFECTURE_PICTOGRAMS: Record<number, string[]> = {
  1: ['P_shiretoko', 'P_lake-mashu', 'F_kelp'], // Hokkaido
  2: ['P_nebuta', 'N_shirakami', 'F_apple'], // Aomori (Shirakami: cùng Akita)
  3: ['P_chuson-ji', 'F_noodles-wanko-soba'], // Iwate
  4: ['P_matsushima', 'F_sasakama'], // Miyagi
  5: ['P_namahage', 'N_shirakami'], // Akita
  6: ['P_ginzan', 'F_cherry'], // Yamagata
  7: ['P_sazaedo'], // Fukushima
  8: ['P_kairakuen', 'P_kashima-jingu', 'N_fukuroda-falls'], // Ibaraki
  9: ['P_nikko-toshogu', 'N_kegon-falls', 'F_strawberry'], // Tochigi
  10: ['P_tomioka', 'N_kusatsu'], // Gunma
  11: ['P_kawagoe'], // Saitama
  12: ['P_shinshoji', 'F_peanut'], // Chiba
  13: [
    'P_tokyo-tower',
    'P_tokyo-skytree',
    'P_asakusa',
    'P_imperial-palace',
    'P_meiji-jingu',
    'P_kabukiza',
    'P_national-diet-building',
    'P_ginza',
    'P_akihabara',
    'P_harajuku',
    'P_toyosu-market',
    'P_kokugikan',
    'P_budokan',
    'P_tokyo-dome',
    'P_national-stadium',
    'N_le-corbusier',
  ], // Tokyo
  14: ['P_kamakura', 'P_tsurugaoka-hachimangu', 'P_enoshima-island', 'P_yokohama-chinatown', 'P_yokohama-brick-warehouse'], // Kanagawa
  15: ['P_sado-island', 'F_sasa-dango', 'F_kakinotane'], // Niigata
  16: ['P_tateyama', 'P_kurobe-gorge', 'F_squid-firefly'], // Toyama
  17: ['P_kenrokuen'], // Ishikawa
  18: ['P_tojinbo', 'P_sabae'], // Fukui
  19: ['P_fuji-five-lakes', 'P_mt-fuji', 'F_grape', 'F_peach'], // Yamanashi (núi Phú Sĩ: cùng Shizuoka)
  20: ['P_matsumoto-castle', 'P_jigokudani', 'N_suwako', 'H_kyu-kaichigakkou-kousha', 'F_oyaki'], // Nagano
  21: ['P_shirakawa-go', 'N_gero'], // Gifu
  22: ['P_mt-fuji', 'P_miho-no-matsubara'], // Shizuoka
  23: ['P_nagoya-castle'], // Aichi
  24: ['P_ise-jingu', 'N_kiisanchi', 'F_lobster'], // Mie (núi Kii: cùng Nara, Wakayama)
  25: ['P_enryakuji'], // Shiga
  26: ['P_rokuonji', 'P_fushimi-inari', 'P_kiyomizu', 'P_ginkaku-ji', 'P_ama-no-hashidate'], // Kyoto
  27: ['P_tsutenkaku-tower', 'P_tower-of-the-sun', 'P_abeno-harukasu', 'P_tomb-emperor-nintoku'], // Osaka
  28: ['P_himeji-castle', 'P_koshien', 'N_arima'], // Hyogo
  29: ['P_nara-park', 'P_todaiji', 'P_horyuji', 'N_kiisanchi'], // Nara
  30: ['P_nachi-falls', 'N_kiisanchi'], // Wakayama
  31: ['P_tottori-sand-dunes'], // Tottori
  32: ['P_izumo', 'H_iwamiginzan', 'F_clam-shijimi'], // Shimane
  33: ['P_korakuen', 'P_seto-bridge', 'F_kibi-dango'], // Okayama (cầu Seto Ohashi: cùng Kagawa)
  34: ['P_itsukushima', 'P_atomic-bomb-dome', 'P_hiroshima-peace-park', 'P_senkoku-ji', 'F_momiji-manju', 'F_oyster'], // Hiroshima
  35: ['P_kintaikyo', 'F_pufferfish'], // Yamaguchi
  36: ['C_awa-dance'], // Tokushima
  37: ['P_kotohiragu', 'P_seto-bridge', 'F_olive'], // Kagawa
  38: ['P_dogo-onsen'], // Ehime
  39: ['P_shimanto-river', 'H_yosakoi'], // Kochi
  40: ['P_dazaifu-tenmangu', 'H_munakata-okinoshima', 'F_spicy-cod-roe'], // Fukuoka
  41: ['P_karatsu-float', 'P_yoshinogari'], // Saga
  42: [
    'H_gunkanjima',
    'P_nagasaki-peace-park',
    'P_oura-church',
    'H_dejima',
    'H_glovergarden',
    'N_hausutenbosu',
    'N_kujukushima',
    'N_fugendake',
    'F_castella',
    'F_karasumi',
  ], // Nagasaki
  43: ['P_amakusa'], // Kumamoto
  44: ['P_yufuin'], // Oita
  45: ['P_takachiho'], // Miyazaki
  46: ['P_yakushima', 'P_tanegashima', 'N_amami-oshima_tokunoshima_iriomotejima'], // Kagoshima (Amami: cùng Okinawa)
  47: ['P_shurijo', 'N_amami-oshima_tokunoshima_iriomotejima'], // Okinawa
};

/** Các tỉnh dùng chung một icon (để ghi chú "cùng với ...") */
export const PICTOGRAM_PREFECTURES: Record<string, number[]> = (() => {
  const out: Record<string, number[]> = {};
  for (const [pref, ids] of Object.entries(PREFECTURE_PICTOGRAMS)) {
    for (const id of ids) (out[id] ||= []).push(Number(pref));
  }
  return out;
})();

/** Biểu tượng riêng của JCAP (public/explore-icons) cho địa điểm bộ NDC không có. Thêm file .svg thì thêm dòng ở đây. */
export const JCAP_ICONS: Pictogram[] = [P('X_airport', '空港', 'Sân bay', 'landmark')];

/**
 * Biểu tượng tình huống: icon chung của bộ NDC (nhập cảnh, tàu điện, combini, onsen...) cho mốc là một tình huống
 * thật chứ không phải địa danh riêng của tỉnh. Không gán cho tỉnh nào; admin chọn trong bộ chọn biểu tượng.
 * Tên tiếng Nhật ở nhóm này là cách gọi thông dụng (không lấy từ trang gốc như các icon theo tỉnh).
 */
export const SCENE_PICTOGRAM_GROUPS: { title: string; items: Pictogram[] }[] = [
  {
    title: 'Sân bay, thủ tục',
    items: [
      P('B_immigration', '入国審査', 'Nhập cảnh', 'landmark'),
      P('B_customs', '税関', 'Hải quan', 'landmark'),
      P('B_baggage-claim', '手荷物受取所', 'Nhận hành lý', 'landmark'),
      P('B_arrival', '到着', 'Sảnh đến', 'landmark'),
      P('B_departure', '出発', 'Khởi hành', 'landmark'),
      P('B_connecting-flight', '乗り継ぎ', 'Nối chuyến', 'landmark'),
      P('B_information', '案内所', 'Quầy thông tin', 'landmark'),
      P('B_cash-machine', 'ATM', 'Máy ATM', 'landmark'),
      P('B_tickets', 'きっぷうりば', 'Quầy bán vé', 'landmark'),
      P('B_locker', 'コインロッカー', 'Tủ gửi đồ', 'landmark'),
      P('B_lost-and-found', '忘れ物取扱所', 'Đồ thất lạc', 'landmark'),
      P('B_tax', '免税', 'Miễn thuế (Tax-free)', 'landmark'),
      P('B_baggage-delivery-service', '手荷物配送', 'Gửi hành lý đi trước', 'landmark'),
      P('B_identification', '身分証明書', 'Giấy tờ tùy thân', 'landmark'),
      P('B_register', '申込書', 'Điền giấy tờ', 'landmark'),
      P('B_reception', '受付', 'Quầy tiếp đón', 'landmark'),
      P('B_waiting-area', '待合室', 'Phòng chờ', 'landmark'),
      P('B_meeting-point', '待ち合わせ場所', 'Điểm hẹn', 'landmark'),
    ],
  },
  {
    title: 'Đi lại',
    items: [
      P('T_airplane', '飛行機', 'Máy bay', 'landmark'),
      P('T_train', '電車', 'Tàu điện', 'landmark'),
      P('T_bullet-train', '新幹線', 'Tàu Shinkansen', 'landmark'),
      P('T_subway', '地下鉄', 'Tàu điện ngầm', 'landmark'),
      P('T_tram', '路面電車', 'Tàu điện mặt đất', 'landmark'),
      P('T_monorail', 'モノレール', 'Tàu một ray', 'landmark'),
      P('T_bus', 'バス', 'Xe buýt', 'landmark'),
      P('T_taxi', 'タクシー', 'Taxi', 'landmark'),
      P('T_ferry', 'フェリー', 'Phà', 'landmark'),
      P('T_sightseeing-boat', '遊覧船', 'Thuyền ngắm cảnh', 'landmark'),
      P('T_ropeway', 'ロープウェイ', 'Cáp treo', 'landmark'),
      P('T_rickshaw', '人力車', 'Xe kéo Jinrikisha', 'landmark'),
      P('T_rental-car', 'レンタカー', 'Thuê ô tô', 'landmark'),
      P('T_bicycle-rental', 'レンタサイクル', 'Thuê xe đạp', 'landmark'),
      P('T_bicycle', '自転車', 'Xe đạp', 'landmark'),
      P('T_sightseeing-train', '観光列車', 'Tàu du lịch', 'landmark'),
      P('T_funicular', 'ケーブルカー', 'Tàu leo núi cáp kéo', 'landmark'),
      P('T_maglev-train', 'リニアモーターカー', 'Tàu đệm từ', 'landmark'),
      P('T_doctor-yellow', 'ドクターイエロー', 'Tàu Doctor Yellow', 'landmark'),
      P('T_cruise-boat', 'クルーズ船', 'Du thuyền', 'landmark'),
      P('B_harbor', '港', 'Bến cảng', 'landmark'),
      P('T_helicopter', 'ヘリコプター', 'Trực thăng', 'landmark'),
      P('T_highway', '高速道路', 'Đường cao tốc', 'landmark'),
      P('T_toll-booth', '料金所', 'Trạm thu phí', 'landmark'),
      P('T_service-area', 'サービスエリア', 'Trạm dừng nghỉ', 'landmark'),
      P('T_parking', '駐車場', 'Bãi đỗ xe', 'landmark'),
    ],
  },
  {
    title: 'Mua sắm, dịch vụ',
    items: [
      P('B_convenience-store', 'コンビニ', 'Cửa hàng tiện lợi (combini)', 'landmark'),
      P('B_department-store', 'デパート', 'Trung tâm thương mại', 'landmark'),
      P('B_shop', 'お店', 'Cửa hàng', 'landmark'),
      P('B_cashier', 'お会計', 'Quầy thanh toán', 'landmark'),
      P('B_vending-machine', '自動販売機', 'Máy bán hàng tự động', 'landmark'),
      P('B_pharmacy', '薬局', 'Hiệu thuốc', 'landmark'),
      P('B_hospital', '病院', 'Bệnh viện', 'landmark'),
      P('B_post-office', '郵便局', 'Bưu điện', 'landmark'),
      P('B_bank', '銀行', 'Ngân hàng', 'landmark'),
      P('B_police-station', '警察署', 'Đồn cảnh sát', 'landmark'),
      P('B_hair-salon', '美容院', 'Tiệm làm tóc', 'landmark'),
      P('B_karaoke', 'カラオケ', 'Karaoke', 'landmark'),
      P('B_police', 'おまわりさん', 'Cảnh sát (Koban)', 'landmark'),
      P('B_scan-code', 'コード決済', 'Thanh toán mã QR', 'landmark'),
      P('B_gift', 'お土産', 'Quà lưu niệm', 'landmark'),
      P('B_gifting', '贈り物', 'Tặng quà', 'landmark'),
      P('B_delivery', '宅配便', 'Giao hàng tận nơi', 'landmark'),
      P('B_washing-machine', 'コインランドリー', 'Tiệm giặt tự động', 'landmark'),
      P('B_hanaya', '花屋', 'Tiệm hoa', 'landmark'),
      P('B_medicine', '薬', 'Thuốc', 'landmark'),
      P('B_gym', 'ジム', 'Phòng tập gym', 'landmark'),
    ],
  },
  {
    title: 'Đời sống, biển báo',
    items: [
      P('B_toilet', 'トイレ', 'Nhà vệ sinh', 'landmark'),
      P('B_wifi', 'Wi-Fi', 'Wi-Fi', 'landmark'),
      P('B_smartphone', 'スマートフォン', 'Điện thoại thông minh', 'landmark'),
      P('B_telephone', '電話', 'Điện thoại', 'landmark'),
      P('B_charge', '充電', 'Sạc pin', 'landmark'),
      P('B_charge-point', 'コンセント', 'Ổ cắm điện', 'landmark'),
      P('B_elevator', 'エレベーター', 'Thang máy', 'landmark'),
      P('B_escalator', 'エスカレーター', 'Thang cuốn', 'landmark'),
      P('B_stand-left', '左側に立つ', 'Đứng bên trái thang cuốn', 'landmark'),
      P('B_stand-right', '右側に立つ', 'Đứng bên phải thang cuốn', 'landmark'),
      P('B_stairs', '階段', 'Cầu thang bộ', 'landmark'),
      P('B_trash-can', 'ゴミ箱', 'Thùng rác', 'landmark'),
      P('B_burnable-trash', '燃えるごみ', 'Rác cháy được', 'landmark'),
      P('B_non-burnable-trash', '燃えないごみ', 'Rác không cháy được', 'landmark'),
      P('B_plastic-bottle', 'ペットボトル', 'Chai nhựa', 'landmark'),
      P('B_can', '缶', 'Vỏ lon', 'landmark'),
      P('B_glass-bottle', 'びん', 'Chai thuỷ tinh', 'landmark'),
      P('B_recyle', 'リサイクル', 'Tái chế', 'landmark'),
      P('B_smoking', '喫煙所', 'Khu hút thuốc', 'landmark'),
      P('B_no-smoking', '禁煙', 'Cấm hút thuốc', 'landmark'),
      P('B_no-photography', '撮影禁止', 'Cấm chụp ảnh', 'landmark'),
      P('B_no-food-drink', '飲食禁止', 'Cấm ăn uống', 'landmark'),
      P('B_no-shoes', '土足禁止', 'Cởi giày trước khi vào', 'landmark'),
      P('B_quiet', 'お静かに', 'Giữ im lặng', 'landmark'),
      P('B_drinking-water', '水飲み場', 'Vòi nước uống', 'landmark'),
      P('B_house', '家', 'Nhà ở', 'landmark'),
      P('B_school', '学校', 'Trường học', 'landmark'),
      P('B_work', '仕事', 'Công việc', 'landmark'),
    ],
  },
  {
    title: 'Ăn uống',
    items: [
      P('F_restaurant', 'レストラン', 'Nhà hàng', 'food'),
      P('F_izakaya', '居酒屋', 'Quán nhậu Izakaya', 'food'),
      P('F_cafe', 'カフェ', 'Quán cà phê', 'food'),
      P('F_food-stall', '屋台', 'Quầy hàng rong Yatai', 'food'),
      P('F_noodles-ramen', 'ラーメン', 'Mì Ramen', 'food'),
      P('F_noodles-udon', 'うどん', 'Mì Udon', 'food'),
      P('F_noodles-soba', 'そば', 'Mì Soba', 'food'),
      P('F_sushi', '寿司', 'Sushi', 'food'),
      P('F_sushi-conveyor-belt', '回転寿司', 'Sushi băng chuyền', 'food'),
      P('F_bento', '弁当', 'Cơm hộp Bento', 'food'),
      P('F_rice-ball', 'おにぎり', 'Cơm nắm Onigiri', 'food'),
      P('F_takoyaki', 'たこ焼き', 'Takoyaki', 'food'),
      P('F_okonomiyaki', 'お好み焼き', 'Okonomiyaki', 'food'),
      P('F_yakitori', '焼き鳥', 'Gà nướng Yakitori', 'food'),
      P('F_tempura', '天ぷら', 'Tempura', 'food'),
      P('F_kaiseki', '懐石料理', 'Ẩm thực Kaiseki', 'food'),
      P('F_japanese-confections', '和菓子', 'Bánh ngọt Nhật Wagashi', 'food'),
      P('F_matcha', '抹茶', 'Trà xanh Matcha', 'food'),
      P('F_sake', '日本酒', 'Rượu sake', 'food'),
      P('F_traditional-japanese-food', '和食', 'Cơm Nhật (Washoku)', 'food'),
      P('F_fast-food', 'ファストフード', 'Đồ ăn nhanh', 'food'),
      P('F_kitchen', '台所', 'Nhà bếp', 'food'),
      P('F_noodles-somen', 'そうめん', 'Mì Somen', 'food'),
      P('F_curry-rice', 'カレーライス', 'Cơm cà ri', 'food'),
      P('F_gyoza', '餃子', 'Há cảo Gyoza', 'food'),
      P('F_pork-cutlet', 'とんかつ', 'Thịt heo chiên xù Tonkatsu', 'food'),
      P('F_yakiniku', '焼肉', 'Thịt nướng Yakiniku', 'food'),
      P('F_yakisoba', '焼きそば', 'Mì xào Yakisoba', 'food'),
      P('F_hot-pot', '鍋料理', 'Lẩu Nabe', 'food'),
      P('F_sukiyaki', 'すき焼き', 'Sukiyaki', 'food'),
      P('F_oden', 'おでん', 'Oden', 'food'),
      P('F_eel', 'うなぎ', 'Lươn nướng Unagi', 'food'),
      P('F_sashimi', '刺身', 'Sashimi', 'food'),
      P('F_tuna', 'マグロ', 'Cá ngừ', 'food'),
      P('F_crab', 'カニ', 'Cua', 'food'),
      P('F_shrimp', 'エビ', 'Tôm', 'food'),
      P('F_beef', '牛肉', 'Thịt bò', 'food'),
      P('F_miso-soup', '味噌汁', 'Súp miso', 'food'),
      P('F_natto', '納豆', 'Natto', 'food'),
      P('F_tofu', '豆腐', 'Đậu phụ', 'food'),
      P('F_pickled-plum', '梅干し', 'Mơ muối Umeboshi', 'food'),
      P('F_pickled-vegetables', '漬物', 'Dưa muối Tsukemono', 'food'),
      P('F_bread-loaf', '食パン', 'Bánh mì gối', 'food'),
      P('F_bun-melon', 'メロンパン', 'Bánh mì Melon pan', 'food'),
      P('F_bun-red-bean', 'あんパン', 'Bánh mì nhân đậu đỏ Anpan', 'food'),
      P('F_pork-hotbun', '肉まん', 'Bánh bao nhân thịt Nikuman', 'food'),
      P('F_rice-cracker', 'せんべい', 'Bánh gạo Senbei', 'food'),
      P('F_taiyaki', 'たい焼き', 'Bánh cá Taiyaki', 'food'),
      P('F_shaved-ice', 'かき氷', 'Đá bào Kakigori', 'food'),
      P('F_mandarine', 'みかん', 'Quýt', 'food'),
      P('F_milk', '牛乳', 'Sữa', 'food'),
      P('F_beer', 'ビール', 'Bia', 'food'),
      P('F_shochu', '焼酎', 'Rượu Shochu', 'food'),
      P('F_whisky-soda', 'ハイボール', 'Highball', 'food'),
      P('F_wine', 'ワイン', 'Rượu vang', 'food'),
      P('F_bar', 'バー', 'Quán bar', 'food'),
    ],
  },
  {
    title: 'Lưu trú',
    items: [
      P('L_hotel', 'ホテル', 'Khách sạn', 'landmark'),
      P('L_japanese-inn', '旅館', 'Nhà trọ kiểu Nhật Ryokan', 'landmark'),
      P('L_capsul-hotel', 'カプセルホテル', 'Khách sạn con nhộng', 'landmark'),
      P('L_guesthouse', 'ゲストハウス', 'Nhà nghỉ Guesthouse', 'landmark'),
      P('L_hot-spring', '温泉', 'Suối nước nóng Onsen', 'landmark'),
      P('L_open-air-bath', '露天風呂', 'Bồn tắm ngoài trời', 'landmark'),
      P('L_bathhouse', '銭湯', 'Nhà tắm công cộng Sento', 'landmark'),
      P('L_foot-bath', '足湯', 'Ngâm chân Ashiyu', 'landmark'),
      P('B_sauna', 'サウナ', 'Xông hơi Sauna', 'landmark'),
      P('B_shower', 'シャワー', 'Vòi sen', 'landmark'),
      P('B_lounge', 'ラウンジ', 'Phòng chờ Lounge', 'landmark'),
      P('B_relaxation', '休憩所', 'Khu nghỉ ngơi', 'landmark'),
    ],
  },
  {
    title: 'Tham quan',
    items: [
      P('B_museum', '博物館', 'Bảo tàng', 'landmark'),
      P('B_aquarium', '水族館', 'Thuỷ cung', 'landmark'),
      P('B_zoo', '動物園', 'Sở thú', 'landmark'),
      P('B_observation-area', '展望台', 'Đài quan sát', 'landmark'),
      P('B_photo-spot', '撮影スポット', 'Điểm chụp ảnh', 'landmark'),
      P('B_audio-guide', '音声ガイド', 'Thuyết minh bằng tai nghe', 'landmark'),
      P('B_play-area', '遊び場', 'Khu vui chơi trẻ em', 'landmark'),
    ],
  },
  {
    title: 'Đền chùa, văn hoá',
    items: [
      P('C_temples', 'お寺', 'Chùa', 'culture'),
      P('C_shrines', '神社', 'Đền Thần đạo', 'culture'),
      P('C_castle', 'お城', 'Lâu đài', 'culture'),
      P('C_japanese-garden', '日本庭園', 'Vườn Nhật', 'culture'),
      P('C_tea-ceremony', '茶道', 'Trà đạo', 'culture'),
      P('C_kimono', '着物', 'Kimono', 'culture'),
      P('C_festival', '祭り', 'Lễ hội', 'culture'),
      P('C_fireworks', '花火', 'Pháo hoa', 'culture'),
      P('C_cherry-blossom-viewing', 'お花見', 'Ngắm hoa anh đào', 'culture'),
      P('H_chozu', '手水', 'Rửa tay trước khi vào đền', 'culture'),
      P('H_osaisen', 'お賽銭', 'Bỏ tiền công đức', 'culture'),
      P('H_omikuji', 'おみくじ', 'Rút quẻ Omikuji', 'culture'),
      P('H_ema', '絵馬', 'Thẻ cầu nguyện Ema', 'culture'),
      P('H_omamori', 'お守り', 'Bùa hộ mệnh Omamori', 'culture'),
      P('H_goshuin', '御朱印', 'Con dấu Goshuin', 'culture'),
      P('H_komainu', '狛犬', 'Tượng chó canh đền Komainu', 'culture'),
      P('H_oinarisan', 'お稲荷さん', 'Tượng cáo Inari', 'culture'),
      P('H_kane', '鐘', 'Chuông chùa', 'culture'),
      P('H_kouro', '香炉', 'Lư hương', 'culture'),
      P('H_oharai', 'お祓い', 'Lễ trừ tà Oharai', 'culture'),
      P('H_omikuji_daikichi', '大吉', 'Quẻ Đại cát', 'culture'),
      P('C_seated-meditation', '座禅', 'Thiền Zazen', 'culture'),
      P('H_bonodori', '盆踊り', 'Múa Bon Odori', 'culture'),
      P('C_tanabata', '七夕', 'Lễ Thất tịch Tanabata', 'culture'),
      P('C_kabuki', '歌舞伎', 'Kabuki', 'culture'),
      P('C_noh', '能', 'Kịch Noh', 'culture'),
      P('C_sumo', '相撲', 'Sumo', 'culture'),
      P('C_samurai', '侍', 'Samurai', 'culture'),
      P('C_ninja', '忍者', 'Ninja', 'culture'),
      P('C_maiko', '舞妓', 'Maiko', 'culture'),
      P('H_nihonbuyo', '日本舞踊', 'Múa truyền thống Nhật', 'culture'),
      P('C_taiko-drum', '和太鼓', 'Trống Taiko', 'culture'),
      P('C_shamisen', '三味線', 'Đàn Shamisen', 'culture'),
      P('C_calligraphy', '書道', 'Thư pháp', 'culture'),
      P('C_flower-arrangement', '生け花', 'Cắm hoa Ikebana', 'culture'),
      P('C_bonsai', '盆栽', 'Bonsai', 'culture'),
      P('C_pottery', '陶芸', 'Làm gốm', 'culture'),
      P('C_papermaking', '紙すき', 'Làm giấy Washi', 'culture'),
      P('C_weaving', '機織り', 'Dệt vải', 'culture'),
      P('C_woodworking', '木工', 'Đồ gỗ thủ công', 'culture'),
      P('C_daruma', 'だるま', 'Búp bê Daruma', 'culture'),
      P('C_kokeshi', 'こけし', 'Búp bê gỗ Kokeshi', 'culture'),
      P('C_ama-divers', '海女', 'Nữ thợ lặn Ama', 'culture'),
      P('C_kofun', '古墳', 'Gò mộ cổ Kofun', 'heritage'),
      P('C_ancient-road', '古道', 'Đường cổ', 'heritage'),
    ],
  },
  {
    title: 'Sân khấu tạp kỹ Yose',
    items: [
      P('C_rakugo', '落語', 'Kể chuyện hài Rakugo', 'culture'),
      P('C_manzai', '漫才', 'Hài đối đáp Manzai', 'culture'),
      P('C_konto', 'コント', 'Tiểu phẩm hài', 'culture'),
      P('C_monomane', 'ものまね', 'Giả giọng', 'culture'),
      P('C_kodan', '講談', 'Kể chuyện lịch sử Kodan', 'culture'),
      P('C_rokyoku', '浪曲', 'Hát kể Rokyoku', 'culture'),
      P('C_kamikiri', '紙切り', 'Cắt giấy nghệ thuật', 'culture'),
      P('C_kijutsu', '奇術', 'Ảo thuật', 'culture'),
      P('C_daikagura', '太神楽', 'Xiếc truyền thống Daikagura', 'culture'),
    ],
  },
  {
    title: 'Trò chơi truyền thống',
    items: [
      P('H_origami', '折り紙', 'Gấp giấy Origami', 'culture'),
      P('H_kendama', 'けん玉', 'Kendama', 'culture'),
      P('H_koma', 'こま', 'Con quay', 'culture'),
      P('N_takoage', '凧揚げ', 'Thả diều', 'culture'),
      P('H_hanetsuki', '羽根つき', 'Đánh cầu Hanetsuki', 'culture'),
      P('H_fukuwarai', '福笑い', 'Ghép mặt Fukuwarai', 'culture'),
      P('H_karuta', 'かるた', 'Bài Karuta', 'culture'),
      P('H_hyakunin-isshu', '百人一首', 'Bài thơ Hyakunin Isshu', 'culture'),
      P('H_hanafuda', '花札', 'Bài hoa Hanafuda', 'culture'),
      P('H_shougi', '将棋', 'Cờ Shogi', 'culture'),
      P('H_ohajiki', 'おはじき', 'Bắn bi dẹt Ohajiki', 'culture'),
      P('H_otedama', 'お手玉', 'Tung túi đậu Otedama', 'culture'),
      P('H_kamizumo', '紙相撲', 'Sumo giấy', 'culture'),
      P('H_kagome-kagome', 'かごめかごめ', 'Trò Kagome Kagome', 'culture'),
      P('H_oshikura-manju', 'おしくらまんじゅう', 'Trò Oshikura Manju', 'culture'),
    ],
  },
  {
    title: 'Thiên nhiên, hoạt động',
    items: [
      P('N_national-park', '国立公園', 'Vườn quốc gia', 'nature'),
      P('N_beach', 'ビーチ', 'Bãi biển', 'nature'),
      P('N_lake', '湖', 'Hồ', 'nature'),
      P('N_waterfall', '滝', 'Thác nước', 'nature'),
      P('N_autumn-leaves', '紅葉', 'Lá đỏ mùa thu', 'nature'),
      P('N_night-view', '夜景', 'Cảnh đêm', 'nature'),
      P('N_sunrise', '日の出', 'Bình minh', 'nature'),
      P('A_climbing', '登山', 'Leo núi', 'nature'),
      P('A_trekking', 'トレッキング', 'Đi bộ đường dài', 'nature'),
      P('A_camping', 'キャンプ', 'Cắm trại', 'nature'),
      P('A_skiing', 'スキー', 'Trượt tuyết', 'nature'),
      P('A_surfing', 'サーフィン', 'Lướt sóng', 'nature'),
      P('N_sunset', '夕日', 'Hoàng hôn', 'nature'),
      P('N_night-sky', '星空', 'Bầu trời sao', 'nature'),
      P('N_snow', '雪景色', 'Cảnh tuyết', 'nature'),
      P('N_drift-ice', '流氷', 'Băng trôi', 'nature'),
      P('N_dune', '砂丘', 'Đồi cát', 'nature'),
      P('N_limestone-cave', '鍾乳洞', 'Hang đá vôi', 'nature'),
      P('N_ancient-forest', '原生林', 'Rừng nguyên sinh', 'nature'),
      P('N_meadow', '草原', 'Đồng cỏ', 'nature'),
      P('N_farm', '牧場', 'Nông trại', 'nature'),
      P('F_rice', '田んぼ', 'Ruộng lúa', 'nature'),
      P('N_pearl', '真珠', 'Ngọc trai', 'nature'),
      P('N_birdwatching', 'バードウォッチング', 'Ngắm chim', 'nature'),
      P('N_whale-watching', 'ホエールウォッチング', 'Ngắm cá voi', 'nature'),
      P('A_fishing', '釣り', 'Câu cá', 'nature'),
      P('A_horse-riding', '乗馬', 'Cưỡi ngựa', 'nature'),
      P('A_hot-air-balloon', '熱気球', 'Khinh khí cầu', 'nature'),
      P('A_rafting', 'ラフティング', 'Chèo thuyền vượt thác', 'nature'),
      P('A_scuba-diving', 'ダイビング', 'Lặn biển', 'nature'),
      P('A_snowboarding', 'スノーボード', 'Trượt ván tuyết', 'nature'),
      P('A_ice-skating', 'スケート', 'Trượt băng', 'nature'),
    ],
  },
  {
    title: 'Hoa, cây theo mùa',
    items: [
      P('B_cherry-blossom', '桜', 'Hoa anh đào', 'nature'),
      P('B_plum', '梅', 'Hoa mơ', 'nature'),
      P('N_fuji', '藤', 'Hoa tử đằng', 'nature'),
      P('N_kakitsubata', 'かきつばた', 'Hoa diên vĩ', 'nature'),
      P('N_tsubaki', '椿', 'Hoa trà', 'nature'),
      P('N_kiku', '菊', 'Hoa cúc', 'nature'),
      P('N_kikyo', '桔梗', 'Hoa cát cánh', 'nature'),
      P('N_nadesiko', 'なでしこ', 'Hoa cẩm chướng Nadeshiko', 'nature'),
      P('N_ginko', 'イチョウ', 'Cây bạch quả', 'nature'),
      P('N_zelkova', 'ケヤキ', 'Cây Keyaki', 'nature'),
    ],
  },
  {
    title: 'Thời tiết, thiên tai',
    items: [
      P('B_sunny', '晴れ', 'Trời nắng', 'nature'),
      P('B_partially-sunny', '晴れ時々曇り', 'Nắng xen mây', 'nature'),
      P('B_cloudy', '曇り', 'Trời nhiều mây', 'nature'),
      P('B_rain', '雨', 'Mưa', 'nature'),
      P('B_heavy-rain', '大雨', 'Mưa lớn', 'nature'),
      P('B_light-snow', '雪', 'Tuyết rơi', 'nature'),
      P('B_wind', '風', 'Gió', 'nature'),
      P('B_lightening', '雷', 'Sấm sét', 'nature'),
      P('B_umbrella', '傘', 'Ô (dù)', 'nature'),
      P('B_emergency', '緊急', 'Khẩn cấp (SOS)', 'landmark'),
      P('B_emergency-exit', '非常口', 'Lối thoát hiểm', 'landmark'),
      P('B_fire-extinguisher', '消火器', 'Bình chữa cháy', 'landmark'),
      P('B_fire-station', '消防署', 'Trạm cứu hoả', 'landmark'),
      P('B_evacuation-site', '避難場所', 'Điểm sơ tán', 'landmark'),
      P('B_emergency-shelter', '避難所', 'Nơi trú ẩn', 'landmark'),
      P('B_evacuation-zone-tsunami', '津波避難場所', 'Điểm sơ tán sóng thần', 'landmark'),
      P('B_hazard-tsunami', '津波注意', 'Cảnh báo sóng thần', 'landmark'),
      P('B_hazard-flood', '洪水注意', 'Cảnh báo lũ lụt', 'landmark'),
      P('B_hazard-mudslide', '土砂災害注意', 'Cảnh báo sạt lở đất', 'landmark'),
      P('B_hazard-falling-rocks', '落石注意', 'Cảnh báo đá lở', 'landmark'),
    ],
  },
];

const SCENE_PICTOGRAMS: Record<string, Pictogram> = Object.fromEntries(
  SCENE_PICTOGRAM_GROUPS.flatMap((g) => g.items).map((p) => [p.id, p]),
);

/** Thông tin một biểu tượng bất kỳ: icon theo tỉnh, icon tình huống hoặc icon riêng của JCAP */
export const pictogramInfo = (id: string): Pictogram | undefined =>
  PICTOGRAMS[id] ?? SCENE_PICTOGRAMS[id] ?? JCAP_ICONS.find((i) => i.id === id);

/**
 * Đường dẫn file biểu tượng. Id có tiền tố "X_" là biểu tượng riêng của JCAP (public/explore-icons) cho địa điểm
 * bộ NDC không có (vd. sân bay), để không lẫn với bộ NDC (bộ NDC không được sửa hình).
 */
export const pictogramUrl = (id: string) =>
  id.startsWith('X_') ? `${import.meta.env.BASE_URL}explore-icons/${id}.svg` : `${import.meta.env.BASE_URL}pictograms/${id}.svg`;
