import re
import sys

def add_examples_to_intent(content, intent_name, new_examples):
    # Find the intent block
    pattern = r'(  - intent: ' + intent_name + r'\n    examples: \|\n)((?:      - .*\n)*)'
    
    def replacer(match):
        existing_examples = match.group(2)
        added_examples = ""
        for ex in new_examples:
            # simple check to avoid exact duplicates
            if f"- {ex}\n" not in existing_examples:
                added_examples += f"      - {ex}\n"
        return match.group(1) + existing_examples + added_examples
    
    new_content, count = re.subn(pattern, replacer, content)
    if count == 0:
        print(f"Warning: Intent {intent_name} not found or no match.")
    else:
        print(f"Updated {intent_name}")
    return new_content

with open('data/nlu.yml', 'r') as f:
    content = f.read()

# Combining all batches
all_data = {
    # BATCH 1
    'return_request': [
        'saya mahu pulangkan cermin mata saya', 'pulangkan eyewear saya', 'saya nak pulangkan cermin mata hitam saya', 'boleh saya pulangkan cermin mata ini', 'saya tersalah beli cermin mata', 'pulangkan cermin mata gucci saya', 'permintaan pemulangan', 'macam mana nak pulangkan', 'saya perlu buat pemulangan', 'hantar balik cermin mata saya', 'saya tak nak cermin mata ini', 'pulangkan pesanan saya', 'tolong saya pulangkan ini', 'saya mahu hantar ini kembali', 'polisi pemulangan',
        '我要退还我的眼镜', '退回我的眼镜', '我想退还太阳镜', '这些眼镜可以退吗', '我买错眼镜了', '退还我的 gucci 眼镜', '退货申请', '怎么退货', '我需要退货', '把眼镜退回去', '我不要这些眼镜了', '退掉我的订单', '帮我退了这个', '退货政策是什么', '如何退回商品',
        'saya nak return glasses ni', 'boleh tak saya return my order', 'how to pulangkan this frame', '我想 return 我的眼镜', '这个可以 return 吗'
    ],
    'refund_request': [
        'saya perlukan bayaran balik', 'polisi bayaran balik', 'boleh saya dapatkan refund', 'bayaran balik untuk pembelian saya', 'saya mahu wang saya dikembalikan', 'mohon bayaran balik', 'bayaran balik untuk cermin mata saya', 'macam mana proses refund', 'polisi pulangan wang', 'minta bayaran balik penuh', 'saya nak claim balik duit saya', 'boleh saya batal dan dapatkan refund', 'refund cermin mata hitam ini', 'berikan saya bayaran balik', 'mana bayaran balik saya',
        '我需要退款', '退款政策', '我可以退款吗', '退我的钱', '我要退款', '申请退款', '我的眼镜怎么退款', '退款怎么操作', '退款保证', '请全额退款', '我想报销', '可以取消并退款吗', '退掉这些太阳镜', '给我退款', '我的退款在哪里',
        'saya nak minta refund', 'bila boleh dapat my refund', 'i want my duit balik', '我想申请 refund', '什么时候可以 get refund'
    ],
    'exchange_request': [
        'tukar cermin mata saya', 'boleh saya tukar bingkai ini', 'tukar cermin mata hitam saya', 'saiz bingkai salah', 'permintaan pertukaran', 'saya perlukan cermin mata ganti', 'ganti eyewear ini', 'nak bingkai lain', 'boleh saya tukar model', 'tukar kanta ini', 'saya mahu pertukaran', 'polisi pertukaran',
        '换我的眼镜', '我可以换这个镜框吗', '换一下我的太阳镜', '镜框尺寸不对', '换货申请', '我需要更换眼镜', '更换这个眼镜', '请换一个镜框', '可以换款式吗', '换这些镜片', '我要换货', '换货政策',
        'nak exchange glasses boleh', 'size salah, nak tukar', 'boleh swap untuk warna lain', '我想 exchange 这个镜框', 'size 不对需要换'
    ],
    'repair_support': [
        'cermin mata saya patah', 'bingkai patah', 'kanta tercalar', 'baiki cermin mata saya', 'betulkan cermin mata hitam saya', 'eyewear rosak', 'bingkai saya rosak', 'bingkai longgar', 'cermin mata bengkok', 'sokongan pembaikan', 'betulkan kanta saya', 'cermin mata perlu dibaiki',
        '我的眼镜坏了', '镜框断了', '镜片刮花了', '修理我的眼镜', '修一下我的太阳镜', '眼镜损坏了', '我的镜框坏了', '镜框松了', '眼镜弯了', '维修支持', '修我的镜片', '眼镜需要维修',
        'my glasses patah', 'nak repair bingkai ni', 'lens scratch macam mana', '我的 frame 坏了', '可以 repair 我的眼镜吗'
    ],
    'warranty_support': [
        'tuntutan waranti', 'ada tawar waranti tak', 'sokongan waranti', 'tuntut waranti', 'dilindungi bawah waranti', 'waranti untuk kanta', 'waranti bingkai', 'patah bawah waranti', 'polisi waranti', 'waranti kanta', 'adakah ini bawah waranti', 'berapa lama tempoh waranti',
        '保修申请', '你们提供保修吗', '保修支持', '申请保修', '在保修范围内', '镜片保修', '镜框保修', '保修期内损坏', '保修政策', '镜片有保修吗', '这个在保修期内吗', '保修期多长',
        'nak claim warranty', 'ni cover under warranty tak', 'how to claim waranti', '我要 claim warranty', '这个有 warranty 吗'
    ],
    'order_support': [
        'masalah pesanan', 'isu dengan pesanan saya', 'sokongan pesanan', 'bantuan dengan pembelian saya', 'batalkan pesanan saya', 'jejak pesanan', 'pesanan saya di mana', 'pesanan lambat', 'salah pesanan', 'barang hilang', 'pesanan tak sampai', 'batalkan pembelian saya',
        '订单问题', '我的订单有问题', '订单支持', '购买求助', '取消我的订单', '跟踪订单', '我的订单在哪里', '订单延迟了', '发错货了', '少件了', '没收到订单', '取消购买',
        'order lambat sangat', 'nak cancel order', 'my order tak sampai lagi', '我的 order 有问题', '帮我 check order'
    ],
    # BATCH 2
    'greet': [
        'selamat petang', 'selamat malam', 'apa khabar', 'jom mula', 'helo calisto', 'ada orang tak', 'saya perlukan pertolongan', 'boleh mula',
        '下午好', '晚上好', '很高兴认识你', '有人在吗', '开始吧', '你好 calisto',
        'hi calisto', 'hello ada orang', 'hi saya perlukan help', '你好，i need help'
    ],
    'browse_eyewear': [
        'saya nak tengok cermin mata', 'boleh tunjukkan spek', 'saya nak beli cermin mata', 'tunjuk cermin mata hitam', 'saya cari cermin mata lelaki', 'nak cermin mata komputer', 'tolong saya pilih eyewear', 'saya nak tengok katalog',
        '我想看看眼镜', '能给我看些镜框吗', '我要买眼镜', '给我看太阳镜', '我在找男士太阳镜', '需要电脑眼镜', '帮我挑选眼镜', '我想看你们的目录',
        'nak browse glasses', 'show cermin mata', '我想看 sunglasses', '有什么 frames 推荐'
    ],
    'find_a_store': [
        'cari kedai paling dekat', 'lokasi kedai', 'di mana cawangan terdekat', 'saya mahu alamat kedai', 'saya mahu kedai di [Kuala Lumpur](city)', 'cari kedai di [Nilai](city)', 'ada cawangan di [Kuala Lumpur](city)', 'cawangan dekat bukit bintang', 'kedai area kuala lumpur',
        '找最近的门店', '门店定位', '最近的分店在哪里', '我要你们的店铺地址', '我想去 [Kuala Lumpur](city) 的门店', '在 [Nilai](city) 找一家店', '你们在 [Kuala Lumpur](city) 有分店吗', '武吉免登附近的分店',
        'nak cari nearest store', 'store kat [Kuala Lumpur](city)', '找最近的 branch', '去 [Nilai](city) 的 store'
    ],
    'choose_city': [
        'saya pilih [Kuala Lumpur](city)', 'cawangan [Melawati Mall](city)', 'berdekatan [Melawati Mall](city)', 'kedai di [Mitsui Outlet Park](city)',
        '我选 [Kuala Lumpur](city)', '[Lalaport Bukit Bintang](city) 的分店', '[Aeon Mall Nilai](city) 门店', '去 [Melawati Mall](city)',
        '[Kuala Lumpur](city) branch', 'store dekat [Nilai](city)'
    ],
    'capture_lead': [
        'saya nak tinggalkan maklumat saya', 'tolong hubungi saya', 'saya nak konsultan call saya', 'ambil butiran saya',
        '我要留下我的信息', '请联系我', '让顾问打给我', '记下我的联系方式',
        'please contact saya', 'call me back boleh', '麻烦 call 我'
    ],
    'search_product': [
        'cermin mata gucci bawah 700', 'spek hitam bawah rm500', 'bingkai besi untuk ofis', 'kanta lekap bawah rm200', 'cermin mata prada', 'bingkai titanium atas 500',
        'gucci 眼镜低于 700', '黑色太阳镜 rm500 以下', '办公用金属镜框', '隐形眼镜 rm200 以下', 'prada 太阳镜', '钛金属镜框 500 以上',
        'cari prada sunglasses', 'titanium frames bawah rm300', '找 gucci frames'
    ],
    # BATCH 3
    'select_product_type': [
        'saya nak [Designer Frames](product_type)', 'tunjuk [Luxury Sunglasses](product_type)', 'saya perlukan [Designer Frames](product_type) hari ini', 'ada [Multifocal Lenses](product_type) tak', 'saya minat [Monthly Lenses](product_type)', 'saya nak [Daily Lenses](product_type)', 'tunjuk koleksi [Luxury Sunglasses](product_type)', 'saya cari [Designer Frames](product_type)',
        '我要 [Designer Frames](product_type)', '给我看 [Luxury Sunglasses](product_type)', '今天需要 [Designer Frames](product_type)', '有 [Multifocal Lenses](product_type) 吗', '我对 [Monthly Lenses](product_type) 感兴趣', '我想要 [Daily Lenses](product_type)', '展示 [Luxury Sunglasses](product_type) 系列', '我在找 [Designer Frames](product_type)',
        'nak tengok [Designer Frames](product_type)', 'show me [Luxury Sunglasses](product_type) collection', '想看 [Contact Lenses](product_type)'
    ],
    'select_brand': [
        'saya sedang cari [Gucci](brand)', 'ada stok [Dior](brand)', 'saya nak tengok cermin mata [Tom Ford](brand)', 'tunjuk [Ray-Ban](brand)', 'ada cermin mata hitam [Oakley](brand) tak', 'tunjuk model [Gucci](brand)', 'hanya [Gucci](brand) sahaja', 'boleh saya semak [Tom Ford](brand)',
        '我在找 [Gucci](brand)', '有 [Dior](brand) 的存货吗', '我想看 [Tom Ford](brand) 眼镜', '展示 [Ray-Ban](brand)', '有 [Oakley](brand) 太阳镜吗', '看看 [Prada](brand) 镜框', '只看 [Gucci](brand)', '可以看下 [Tom Ford](brand) 吗',
        'nak tengok [Prada](brand)', 'show [Gucci](brand) please', '找 [Dior](brand) brand'
    ],
    'select_budget': [
        'bajet saya [Under RM100](price_range)', 'bajet [RM100 - RM250](price_range)', 'saya boleh belanja [Above RM300](price_range)', 'tunjuk produk [Under RM100](price_range)', 'tolong tunjuk koleksi [Above RM300](price_range)',
        '我的预算是 [Under RM100](price_range)', '预算在 [RM100 - RM250](price_range)', '我可以花 [Above RM300](price_range)', '看看 [Under RM100](price_range) 的产品', '请展示 [Above RM300](price_range) 的系列',
        'budget [Under RM100](price_range)', 'ada [Above RM300](price_range) tak', '想要 [RM100 - RM250](price_range)'
    ],
    'ask_lens_type': [
        'beritahu saya pasal kanta single vision', 'saya nak kanta progresif', 'saya perlukan kanta perlindungan blue light', 'apakah kanta photochromic', 'terangkan jenis kanta', 'bandingkan kanta single vision dan progresif', 'cadangkan jenis kanta', 'kanta apa yang terbaik untuk saya',
        '告诉我单光镜片的信息', '我想要渐进镜片', '我需要防蓝光镜片', '什么是光致变色镜片', '解释一下镜片类型', '比较单光和渐进镜片', '推荐一款镜片', '哪种镜片最适合我',
        'nak tahu pasal single vision lenses', 'explain kanta progresif', '推荐 progressive lenses'
    ],
    'lens_vision_solutions': [
        'tunjuk pilihan kanta', 'saya perlukan kanta', 'bantu saya dengan penyelesaian penglihatan', 'jenis kanta apa yang anda tawarkan', 'saya minat nak upgrade kanta', 'saya perlukan kanta untuk kurangkan ketegangan mata dari skrin',
        '给我看镜片选项', '我需要镜片', '帮我解决视力问题', '你们提供什么类型的镜片', '我想升级镜片', '我需要能缓解屏幕眼疲劳的镜片',
        'nak tengok lens options', 'show me kanta', '需要 lens 解决方案'
    ],
    'search_product_by_attribute': [
        'saya perlukan cermin mata warna [blue](frame_color)', 'cari cermin mata bingkai [rectangular](frame_shape)', 'ada bingkai [black](frame_color) tak', 'saya nak cermin mata hitam [red](frame_color) [aviator](frame_shape)', 'tunjuk cermin mata [metal](frame_material) warna [blue](frame_color)', 'saya nak [acetate](frame_material)', 'cari [silver](frame_color) [aviator](frame_shape)',
        '我需要 [blue](frame_color) 色眼镜', '找 [rectangular](frame_shape) 框眼镜', '有 [black](frame_color) 镜框吗', '我要 [red](frame_color) 色 [aviator](frame_shape) 太阳镜', '展示 [blue](frame_color) 色 [metal](frame_material) 眼镜', '我要 [acetate](frame_material) 镜框', '找 [silver](frame_color) 色 [aviator](frame_shape)',
        'nak cari frames [black](frame_color)', '找 [metal](frame_material) frames', 'ada bingkai [round](frame_shape)'
    ],
    'product_recommendation': [
        'cadangkan cermin mata untuk [office](use_case)', 'saya perlukan bingkai untuk [screen](use_case)', 'apa yang anda cadangkan untuk [driving](use_case)', 'cadangkan eyewear untuk [daily wear](use_case)', 'cermin mata apa yang bagus untuk [computer](use_case)', 'apa yang terbaik untuk [eye strain](use_case)',
        '推荐 [office](use_case) 用的眼镜', '我需要 [screen](use_case) 时间戴的镜框', '[driving](use_case) 推荐什么', '推荐 [daily wear](use_case) 眼镜', '什么眼镜适合 [computer](use_case) 工作', '[eye strain](use_case) 用什么最好',
        'recommend glasses for [driving](use_case)', 'nak eyewear untuk [sports](use_case)', '适合 [office](use_case) 的眼镜'
    ],
    'inform_budget': [
        'bajet saya [100](budget)', 'sekitar [250](budget) dolar', 'saya boleh belanja [500](budget)', 'maksimum saya [350](budget)', 'bawah [300](budget)', 'bajet saya [rm300](budget)',
        '我的预算是 [100](budget)', '大约 [250](budget) 刀', '我可以花 [500](budget)', '我的上限是 [350](budget)', '控制在 [300](budget) 以内', '我的预算是 [rm300](budget)',
        'budget around [200](budget)', 'limit saya [350](budget)', '预算 [rm250](budget)'
    ],
    # BATCH 4
    'share_name': [
        'nama saya [Ahmad](lead_name)', 'saya [Siti](lead_name)', 'ini [Ali](lead_name)', 'boleh panggil saya [Chong](lead_name)',
        '我的名字是 [张伟](lead_name)', '我是 [李娜](lead_name)', '这是 [王强](lead_name)', '你可以叫我 [刘洋](lead_name)',
        'my name is [Ahmad](lead_name)', 'panggil saya [Kevin](lead_name)', '我是 [John](lead_name)'
    ],
    'share_phone': [
        'nombor saya [0123456789](contact_number)', 'hubungi saya di [60123456789](contact_number)', 'boleh capai saya di [0198877665](contact_number)',
        '我的号码是 [0123456789](contact_number)', '请打给我 [60123456789](contact_number)', '可以通过 [0198877665](contact_number) 找到我',
        'my phone [0127788990](contact_number)', 'call saya di [0171234567](contact_number)'
    ],
    'share_email': [
        'emel saya [ahmad@example.com](email)', 'emelkan ke [siti@gmail.com](email)', 'guna [support@calisto.my](email)',
        '我的邮箱是 [zhangwei@example.com](email)', '发邮件到 [lina@gmail.com](email)', '使用 [wangqiang@example.com](email)',
        'my email [ali@contoh.my](email)', 'email saya [hello@sample.com](email)'
    ],
    'share_location': [
        'saya di [Kuala Lumpur](lead_location)', 'terletak di [Petaling Jaya](lead_location)', 'kawasan saya [Nilai](lead_location)', 'saya tinggal di [Shah Alam](lead_location)',
        '我在 [吉隆坡](lead_location)', '位于 [八打灵再也](lead_location)', '我的区域是 [汝来](lead_location)', '我住在 [莎阿南](lead_location)',
        'i am based in [Kuala Lumpur](lead_location)', 'tinggal kat [Nilai](lead_location)'
    ],
    'share_service_interest': [
        'saya perlukan [Lens Consultation](preferred_service)', 'saya mahu [Eyewear Recommendation](preferred_service)', 'saya perlukan [After-sales Support](preferred_service)', 'saya berminat dengan [Luxury Sunglasses](preferred_service)',
        '我需要 [Lens Consultation](preferred_service)', '我想要 [Eyewear Recommendation](preferred_service)', '我需要 [After-sales Support](preferred_service)', '我对 [Luxury Sunglasses](preferred_service) 感兴趣',
        'nak tanya pasal [Designer Frames](preferred_service)', 'interested in [Contact Lenses](preferred_service)'
    ],
    'share_timeline': [
        'saya perlu [This Week](purchase_timeline)', 'mungkin [Within 2 Weeks](purchase_timeline)', 'saya cuma [Just Exploring](purchase_timeline)',
        '我需要 [This Week](purchase_timeline)', '可能 [Within 2 Weeks](purchase_timeline)', '我只是 [Just Exploring](purchase_timeline)',
        'nak beli [This Week](purchase_timeline)', 'tengok-tengok je [Just Exploring](purchase_timeline)'
    ],
    'ask_pricing': [
        'berapa harga bingkai anda', 'apakah julat harga', 'berapa kosnya', 'harga untuk cermin mata gucci', 'berapa mahal cermin mata berjenama', 'minta harga bingkai', 'berapa harga untuk pemeriksaan mata',
        '你们的镜框多少钱', '价格范围是多少', '这个要多少钱', 'gucci 眼镜的价格', '名牌眼镜有多贵', '请问镜框价格', '验眼多少钱',
        'price untuk frame ni berapa', 'berapa cost untuk sunglasses'
    ],
    'select_pricing_category': [
        'harga untuk [Designer Frames](preferred_service)', 'tunjuk harga [Luxury Sunglasses](preferred_service)', 'saya nak harga [Lens Consultation](preferred_service)',
        '[Designer Frames](preferred_service) 的价格', '看 [Luxury Sunglasses](preferred_service) 价格', '我要 [Lens Consultation](preferred_service) 价格',
        'nak tahu price [Designer Frames](preferred_service)'
    ],
    'book_appointment': [
        'tempah ujian mata', 'jadualkan konsultasi', 'saya perlukan janji temu', 'tempah lawatan kedai', 'boleh saya tempah sesi fitting', 'tolong saya tempah lawatan kedai', 'tempah untuk saya minggu ini',
        '预约验眼', '安排咨询', '我需要一个预约', '预约到店参观', '我可以预约试戴吗', '帮我预约去店里', '帮我预约这周',
        'nak book appointment', 'boleh book eye test tak'
    ],
    'reschedule_appointment': [
        'saya perlu jadualkan semula janji temu', 'boleh saya tukar masa janji temu', 'saya mahu anjakkan tempahan', 'tolong saya ubah jadual ujian mata', 'boleh saya tangguhkan janji temu',
        '我需要重新安排预约', '我可以更改预约时间吗', '我想推迟我的预订', '帮我改一下验眼时间', '我可以延期预约吗',
        'nak reschedule my appointment', 'boleh tukar date appointment'
    ],
    'order_tracking': [
        'saya nak jejak pesanan saya', 'boleh semak status pesanan', 'di mana pesanan saya', 'tolong jejak pesanan [ORD-1024](order_id)', 'nombor pesanan saya [CAL-8891](order_id)',
        '我要跟踪我的订单', '可以查一下订单状态吗', '我的订单在哪里', '帮我跟踪订单 [ORD-1024](order_id)', '我的订单号是 [CAL-8891](order_id)',
        'nak track order', 'check status order [ORD-1024](order_id)'
    ],
    'warranty_claim': [
        'saya perlu buat tuntutan waranti', 'macam mana nak tuntut waranti', 'bingkai saya ada masalah dan perlukan waranti', 'boleh bantu untuk tuntutan waranti',
        '我需要申请保修', '怎么索赔保修', '我的镜框有问题需要保修', '能帮忙处理保修申请吗',
        'nak claim warranty', 'how to claim waranti'
    ],
    'human_handoff': [
        'saya mahu bercakap dengan manusia', 'sambungkan ke ejen', 'biar saya bercakap dengan konsultan', 'boleh orang sebenar hubungi saya', 'saya perlukan sokongan manusia',
        '我想和真人交谈', '连接到人工客服', '让我和顾问谈谈', '能让真人联系我吗', '我需要人工服务',
        'nak cakap dengan real person', 'connect ke agent'
    ],
    'store_hours': [
        'pukul berapa kedai buka', 'apakah waktu operasi kedai', 'bila kedai tutup', 'pukul berapa cawangan kl tutup', 'waktu operasi',
        '你们店几点开门', '门店营业时间是什么', '你们什么时候关门', '吉隆坡分店几点关门', '营业时间',
        'what time kedai tutup', 'store buka pukul berapa'
    ],
    'after_sales_support': [
        'saya perlukan sokongan selepas jualan', 'bantuan waranti', 'tolong dengan pesanan saya', 'saya perlukan servis selepas beli', 'cermin mata saya rasa longgar',
        '我需要售后支持', '保修协助', '订单求助', '购买后需要服务', '我的眼镜感觉有点松',
        'nak minta after sales support', 'tolong dengan my purchase'
    ],
    'affirm': [
        'ya', 'yup', 'ok', 'pasti', 'mestilah', 'boleh',
        '是', '是的', '好的', '当然', '没问题',
        'yes boleh', 'ok sure'
    ],
    'deny': [
        'tak', 'tidak', 'bukan sekarang', 'tak mahu', 'jangan',
        '不', '不是', '现在不要', '不要', '不用了',
        'no taknak', 'takpe thanks'
    ],
    'ask_faq': [
        'apakah polisi pemulangan anda', 'ada tawar bayaran balik', 'berapa lama boleh pulangkan cermin mata', 'apa waranti untuk bingkai', 'boleh saya tukar cermin mata hitam', 'apakah polisi kedai anda', 'masa dan kos penghantaran', 'ada waranti tak', 'macam mana nak tuntut bayaran balik', 'polisi pemulangan',
        '你们的退货政策是什么', '提供退款吗', '眼镜可以退多久', '镜框的保修期是多久', '可以换太阳镜吗', '你们的门店政策是什么', '配送时间和费用', '有保修吗', '如何申请退款', '退货政策',
        'return policy macam mana', 'ada refund tak'
    ]
}

for intent, examples in all_data.items():
    content = add_examples_to_intent(content, intent, examples)

with open('data/nlu.yml', 'w') as f:
    f.write(content)
print("Finished updating nlu.yml")
