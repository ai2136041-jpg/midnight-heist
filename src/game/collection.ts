/**
 * The museum collection: ten dinosaur bones and eight fossil types.
 * This file owns the story text (Arabic + English) so the book always has content,
 * even if a future translator only touches the UI dictionaries.
 */
import type { Tier } from './rules'

export type Localized = { en: string; ar: string }
export type Locale = 'en' | 'ar'
export const pickText = (text: Localized, locale: Locale): string => text[locale]

export type BonePart = {
  id: number
  /** Stable id used by saves and DOM attributes. */
  key: string
  name: Localized
  latin: string
  period: Localized
  fact: Localized
  recovered: Localized
  book: Localized
}

export type FossilId =
  | 'ammonite'
  | 'trilobite'
  | 'fern'
  | 'fish'
  | 'leaf'
  | 'shell'
  | 'insect'
  | 'footprint'
  | 'coral'
  | 'sharktooth'
  | 'egg'
  | 'petrifiedwood'

export type FossilType = {
  id: FossilId
  name: Localized
  latin: Localized
  period: Localized
  fact: Localized
  /** Sediment / fossil tint for the in-world model. */
  tint: number
  book: Localized
}

/** The ten pieces of "Auroraptor heisti" (سارق الفجر), one per campaign level. */
export const BONE_PARTS: BonePart[] = [
  {
    id: 0, key: 'skull', name: { ar: 'الجمجمة', en: 'Skull' }, latin: 'Cranium auroraptoris',
    period: { ar: 'الطباشيري المتأخر', en: 'Late Cretaceous' },
    fact: { ar: 'الطول 68 سم · العرض 41 سم · سعة القحف 190 مل', en: 'Length 68 cm · Width 41 cm · Cranial capacity 190 ml' },
    recovered: { ar: 'خزانة زجاجية في الجناح الشرقي', en: 'A glass case in the east wing' },
    book: {
      ar: 'أول ما يعيد لك شكل الديناصور هو الجمجمة. عظامها الجدارية سميكة، ومحجرا العينين واسعان، ما يوحي بأن «سارق الفجر» كان يصطاد في الضوء الخافت. لاحظت أيضًا قناة صغيرة فوق الأنف، ربما كانت تحمل كيسًا هوائيًا يساعده على إصدار نداء منخفض.',
      en: 'The skull is what first gives the dinosaur back its face. Its brow bones are thick and the eye sockets unusually wide, suggesting Dawn-Raider hunted in low light. I also found a small channel above the nose, perhaps for an air sac that deepened its call.',
    },
  },
  {
    id: 1, key: 'jaw', name: { ar: 'الفك السفلي', en: 'Lower jaw' }, latin: 'Mandibula auroraptoris',
    period: { ar: 'الطباشيري المتأخر', en: 'Late Cretaceous' },
    fact: { ar: 'الطول 54 سم · 14 سنًّا على كل جانب', en: 'Length 54 cm · 14 teeth per side' },
    recovered: { ar: 'رفّ جانبي في صالة العرض', en: 'A side shelf in the gallery' },
    book: {
      ar: 'الفك السفلي خفيف لكنه قوي، ويحمل صفًّا من الأسنان المعقوفة إلى الخلف. هذا التقوّس ليس عيبًا في الحفظ؛ إنه تصميم يمنع الفريسة من الانزلاق. عندما ركّبته تحت الجمجمة بدا الهيكل أخيرًا وكأنه يبتسم لنا.',
      en: 'The lower jaw is light but strong, with a row of teeth curved backwards. That curve is not a flaw in preservation; it is a design that keeps prey from slipping away. Once I fitted it under the skull, the skeleton finally seemed to smile at us.',
    },
  },
  {
    id: 2, key: 'teeth', name: { ar: 'الأسنان', en: 'Teeth' }, latin: 'Dentes auroraptoris',
    period: { ar: 'الطباشيري المتأخر', en: 'Late Cretaceous' },
    fact: { ar: '28 سنًّا · طول السن 3.4 سم · حواف مسننة', en: '28 teeth · 3.4 cm crown · serrated edges' },
    recovered: { ar: 'علبة معدنية داخل مكتب الحارس', en: 'A metal tin inside the guard office' },
    book: {
      ar: 'الأسنان واحدة من أدق ما جمعناه. حوافها مسننة كسكين جيد، وبعضها مهترئ أكثر من غيره، وهذا يعني أن الديناصور كان يستبدل أسنانه طوال حياته. تحت المجهر ظهرت خطوط نمو يومية تشبه حلقات الشجرة.',
      en: 'The teeth are among the finest pieces we recovered. Their edges are serrated like a good knife, and some are more worn than others, meaning the dinosaur replaced them throughout its life. Under the lens I saw daily growth lines like tree rings.',
    },
  },
  {
    id: 3, key: 'neck', name: { ar: 'فقرات العنق', en: 'Neck vertebrae' }, latin: 'Vertebrae cervicales',
    period: { ar: 'الطباشيري المتأخر', en: 'Late Cretaceous' },
    fact: { ar: '7 فقرات · طول العنق 92 سم · مفاصل كروية', en: '7 vertebrae · 92 cm neck · ball joints' },
    recovered: { ar: 'صندوق محفوظات في قاعة المحاضرات', en: 'An archive crate in the lecture hall' },
    book: {
      ar: 'سبع فقرات فقط، لكنها تكفي لتمنح العنق مرونة مدهشة. المفاصل الكروية تسمح بالالتفات دون تحريك الجسم كله، وهي سمة رأيتها في طيور اليوم أكثر من الزواحف. هنا بدأت أشك أن «سارق الفجر» كان أسرع مما تخيلت.',
      en: 'Only seven vertebrae, yet they give the neck remarkable flexibility. The ball joints allow it to turn without moving the whole body, a trait I associate more with modern birds than with reptiles. This is where I began to suspect Dawn-Raider was faster than I first imagined.',
    },
  },
  {
    id: 4, key: 'ribs', name: { ar: 'الأضلاع', en: 'Ribs' }, latin: 'Costae auroraptoris',
    period: { ar: 'الطباشيري المتأخر', en: 'Late Cretaceous' },
    fact: { ar: '11 زوجًا · قوس الصدر 1.1 م · علامات كسر ملتئم', en: '11 pairs · 1.1 m chest arch · healed fracture marks' },
    recovered: { ar: 'خلف لوحة كبيرة في المعرض', en: 'Behind a large painting in the gallery' },
    book: {
      ar: 'أحد الأضلاع يحمل كسرًا قديمًا التأم قبل الموت بسنوات. هذا لا يضعف القطعة؛ بل يخبرنا أن الحيوان نجا من حادث عنيف وعاش بعده. القوس الصدري واسع، وربما كان يضم رئة كبيرة تدفئ الجسم في ليالي الطباشيري الباردة.',
      en: 'One rib carries an old fracture that healed years before death. That does not weaken the specimen; it tells us the animal survived a violent accident and lived on. The chest arch is broad, perhaps housing large lungs that kept it warm on cold Cretaceous nights.',
    },
  },
  {
    id: 5, key: 'spine', name: { ar: 'العمود الفقري', en: 'Spine' }, latin: 'Columna vertebralis',
    period: { ar: 'الطباشيري المتأخر', en: 'Late Cretaceous' },
    fact: { ar: '24 فقرة ظهرية · طول السلسلة 1.8 م', en: '24 dorsal vertebrae · 1.8 m column' },
    recovered: { ar: 'فتحة تهوية في القبو', en: 'A vent shaft in the basement' },
    book: {
      ar: 'العمود الفقري هو العمود الفعلي للمتحف. كل فقرة تحمل نتوءًا شوكيًا طويلًا، وهي نقاط تثبيت لعضلات الظهر. رصّها على الأرض كان أصعب خطوة؛ أي فراغ بينها كان سيجعل الهيكل كله يتقوّس. الآن يقف مستقيمًا.',
      en: 'The spine is the museum’s true column. Each vertebra carries a long neural spine, an anchor for back muscles. Laying them out was the hardest step; a single gap would have bent the whole skeleton. Now it stands straight.',
    },
  },
  {
    id: 6, key: 'pelvis', name: { ar: 'الحوض', en: 'Pelvis' }, latin: 'Pelvis auroraptoris',
    period: { ar: 'الطباشيري المتأخر', en: 'Late Cretaceous' },
    fact: { ar: 'العرض 84 سم · فتحة الورك 21 سم · عظم كثيف', en: 'Width 84 cm · Hip opening 21 cm · dense bone' },
    recovered: { ar: 'حجرة الخزنة خلف باب مقفل', en: 'The vault room behind a locked door' },
    book: {
      ar: 'الحوض يفسّر طريقة حركته: عظم الورك طويل ويميل إلى الأمام، لذلك كانت الأرجل تحت الجسم لا إلى الجانبين. هذه هي هندسة العدّاء. حين ثبتّا الحوض في مكانه، صار بإمكاننا تقدير أن الديناصور كان أطول من حارس المتحف.',
      en: 'The pelvis explains how it moved: the hip bone is long and tilts forward, so the legs sat under the body rather than at its sides. That is sprinter geometry. When we fixed the pelvis in place, we could finally estimate the dinosaur stood taller than the museum guard.',
    },
  },
  {
    id: 7, key: 'tail', name: { ar: 'فقرات الذيل', en: 'Tail vertebrae' }, latin: 'Vertebrae caudales',
    period: { ar: 'الطباشيري المتأخر', en: 'Late Cretaceous' },
    fact: { ar: '19 فقرة · الطول 2.2 م · نهايات متصلة', en: '19 vertebrae · 2.2 m long · interlocking tips' },
    recovered: { ar: 'خزانة ممر الخدمة', en: 'A service-corridor locker' },
    book: {
      ar: 'الذيل ليس زائدة؛ إنه ثقل موازن. الفقرات تتداخل عند نهاياتها لتصنع عصا صلبة، وهذا يساعد على الجري والتوازن عند الالتفاف. آخر فقرة رقيقة جدًا، كأن الذيل كان ينتهي بسوط صغير.',
      en: 'The tail is no appendage; it is a counterweight. The vertebrae interlock at their tips to form a stiff rod, which helps with running and turning. The last vertebra is very thin, as if the tail ended in a small whip.',
    },
  },
  {
    id: 8, key: 'forelimb', name: { ar: 'الطرف الأمامي', en: 'Forelimb' }, latin: 'Brachium auroraptoris',
    period: { ar: 'الطباشيري المتأخر', en: 'Late Cretaceous' },
    fact: { ar: 'الطول 76 سم · ثلاثة أصابع · مخالب معقوفة', en: 'Length 76 cm · three fingers · hooked claws' },
    recovered: { ar: 'منصة عرض في المدخل', en: 'A display platform near the entrance' },
    book: {
      ar: 'الطرف الأمامي أقصر مما تتوقع، لكنه ليس ضعيفًا. المخالب الثلاثة معقوفة ومقوّسة، مناسبة للإمساك أكثر من الجري. تخيّلت «سارق الفجر» يستخدمها لتثبيت فريسة صغيرة أو للتشبث بجذع شجرة أثناء العاصفة.',
      en: 'The forelimb is shorter than you would expect, but not weak. Its three claws are hooked and curved, better for gripping than running. I imagined Dawn-Raider using them to pin small prey or cling to a tree trunk in a storm.',
    },
  },
  {
    id: 9, key: 'hindlimb', name: { ar: 'الطرف الخلفي', en: 'Hindlimb' }, latin: 'Femur auroraptoris',
    period: { ar: 'الطباشيري المتأخر', en: 'Late Cretaceous' },
    fact: { ar: 'الفخذ 98 سم · الساق 84 سم · قدم بثلاثة أصابع', en: 'Femur 98 cm · Shin 84 cm · Three-toed foot' },
    recovered: { ar: 'أعلى رف في غرفة الأرشيف', en: 'The top shelf of the archive room' },
    book: {
      ar: 'الطرف الخلفي هو آخر قطعة، وأثقلها. الفخذ أطول من الساق بقليل، وقدمه ثلاثية الأصابع كقدم طائر كبير. عند تركيب هذه القطعة اكتمل الهيكل، ولم يعد «سارق الفجر» مجموعة عظام؛ صار كائنًا يقف في وسط القاعة. هذه آخر صفحة، لكنها بداية ما نعرفه عنه.',
      en: 'The hindlimb was the last and heaviest piece. The femur is slightly longer than the shin, and the foot has three toes like a large bird. With this piece in place the skeleton was complete, and Dawn-Raider was no longer a set of bones; it was a creature standing in the hall. This is the last page, but only the beginning of what we know about it.',
    },
  },
]

export const BONE_COUNT = BONE_PARTS.length

export const FOSSILS: FossilType[] = [
  {
    id: 'ammonite', name: { ar: 'أمونيت', en: 'Ammonite' }, latin: { ar: 'Ammonoidea', en: 'Ammonoidea' },
    period: { ar: 'الجوراسي', en: 'Jurassic' },
    fact: { ar: 'القطر 14 سم · 38 حجرة هوائية', en: 'Diameter 14 cm · 38 air chambers' },
    tint: 0xd8c9a0,
    book: {
      ar: 'الأمونيت ليس حلزونًا، بل قريب قديم من الحبار. الصدفة الملتوية مبنية من حجرات تتصل بأنبوب رفيع يتحكم بالطفو. كل خط على السطح يعلّم مرحلة نمو، كأن الصدفة سجل يوميات لصاحبها.',
      en: 'An ammonite is not a snail but an ancient relative of squid. Its coiled shell is built from chambers connected by a thin tube that controlled buoyancy. Every line on the surface marks a growth stage, as if the shell kept a diary.',
    },
  },
  {
    id: 'trilobite', name: { ar: 'ثلاثي الفصوص', en: 'Trilobite' }, latin: { ar: 'Trilobita', en: 'Trilobita' },
    period: { ar: 'الكمبري', en: 'Cambrian' },
    fact: { ar: 'الطول 9 سم · 12 زوجًا من الأرجل', en: 'Length 9 cm · 12 pairs of legs' },
    tint: 0xbfae8c,
    book: {
      ar: 'ثلاثي الفصوص سبح في بحار الكمبري قبل أن تظهر الأسماك الكبيرة. عيناه مركبتان من الكالسيت، أي أنه كان يرى العالم عبر بلورات. هذه العينة تحتفظ بثلاثة فصوص واضحة، ومنها جاء الاسم.',
      en: 'Trilobites swam in Cambrian seas before large fish existed. Their compound eyes were made of calcite, so they saw the world through crystals. This specimen keeps three clear lobes, which is where the name comes from.',
    },
  },
  {
    id: 'fern', name: { ar: 'سرخس عتيق', en: 'Ancient fern' }, latin: { ar: 'Filices antiquae', en: 'Filices antiquae' },
    period: { ar: 'الفحمي', en: 'Carboniferous' },
    fact: { ar: 'طول الورقة 31 سم · 22 وريقة', en: 'Frond 31 cm · 22 leaflets' },
    tint: 0x9fae72,
    book: {
      ar: 'السرخس حُفظ مسطحًا في طين ناعم، ثم تحوّل الطين إلى صخر. الوريقة الأخيرة ملتوية قليلًا، وربما كانت النباتات تنمو في ظل كثيف. معظم فحم العالم بدأ من غابات مثل هذه.',
      en: 'The fern was pressed flat in fine mud that later turned to stone. The last leaflet is slightly curled, perhaps because these plants grew in deep shade. Much of the world’s coal began in forests like this one.',
    },
  },
  {
    id: 'fish', name: { ar: 'سمكة أحفورية', en: 'Fossil fish' }, latin: { ar: 'Osteichthyes', en: 'Osteichthyes' },
    period: { ar: 'الطباشيري', en: 'Cretaceous' },
    fact: { ar: 'الطول 22 سم · 41 فقرة · حراشف دقيقة', en: 'Length 22 cm · 41 vertebrae · fine scales' },
    tint: 0xc8b894,
    book: {
      ar: 'السمكة محفوظة على صفيحة واحدة، وحراشفها ما زالت تعكس الضوء عند تحريك الصفيحة. شكل الذيل يشير إلى سباحة سريعة، وأسنانها الصغيرة تخبرنا أنها كانت تأكل اللافقاريات. انظر إلى العين: بقيت الحلقة الصلبة واضحة.',
      en: 'The fish is preserved on a single slab, and its scales still catch the light when the slab is tilted. The tail shape suggests fast swimming, and the small teeth suggest a diet of invertebrates. Look at the eye: the hard ring is still visible.',
    },
  },
  {
    id: 'leaf', name: { ar: 'ورقة عريضة', en: 'Broadleaf' }, latin: { ar: 'Folium latum', en: 'Folium latum' },
    period: { ar: 'الباليوجين', en: 'Paleogene' },
    fact: { ar: 'الطول 18 سم · عروق متشعبة', en: 'Length 18 cm · branching veins' },
    tint: 0xb9a77d,
    book: {
      ar: 'الورقة العريضة علامة على مناخ دافئ ورطب. عروقها المتشعبة كانت تنقل الماء إلى كل حافة، وحافة الورقة مسننة قليلًا. وجدت تحتها أثر حشرة صغيرة، ربما كانت تأكلها قبل أن تدفنها الرواسب.',
      en: 'A broad leaf is a sign of a warm, humid climate. Its branching veins carried water to every edge, and the margin is slightly toothed. Beneath it I found a tiny insect trace, perhaps a creature that was eating it before sediment buried them both.',
    },
  },
  {
    id: 'shell', name: { ar: 'محارة', en: 'Bivalve shell' }, latin: { ar: 'Bivalvia', en: 'Bivalvia' },
    period: { ar: 'الميوسين', en: 'Miocene' },
    fact: { ar: 'العرض 11 سم · 26 خط نمو', en: 'Width 11 cm · 26 growth lines' },
    tint: 0xd6c6ab,
    book: {
      ar: 'المحارة مغلقة كما كانت في قاع البحر. خطوط النمو تتناوب بين عريض وضيق، وهذا يعني فصولًا واضحة في ذلك البحر القديم. الصدفة نفسها صارت حجرًا، لكن شكلها لم يتغير.',
      en: 'The shell is closed exactly as it was on the seafloor. Its growth lines alternate between wide and narrow, recording clear seasons in that ancient sea. The shell itself has turned to stone, yet its shape is unchanged.',
    },
  },
  {
    id: 'insect', name: { ar: 'حشرة في الكهرمان', en: 'Amber insect' }, latin: { ar: 'Insecta in succino', en: 'Insecta in succino' },
    period: { ar: 'الإيوسين', en: 'Eocene' },
    fact: { ar: 'الحجم 6 مم · أجنحة سليمة · كهرمان بلطي', en: '6 mm · intact wings · Baltic amber' },
    tint: 0xe0a84a,
    book: {
      ar: 'الكهرمان نافذة صغيرة إلى يوم واحد قبل خمسين مليون سنة. الحشرة محفوظة بأجنحتها وأرجلها الدقيقة، وكأن الزمن توقف. لا نفتح الكهرمان؛ نصوره بالأشعة ونترك الجسم كما هو. هذه القطعة أغلى مما تبدو.',
      en: 'Amber is a small window into a single day fifty million years ago. The insect is preserved with its wings and delicate legs, as if time stopped. We do not open amber; we scan it and leave the body untouched. This piece is worth more than it looks.',
    },
  },
  {
    id: 'footprint', name: { ar: 'أثر قدم', en: 'Footprint' }, latin: { ar: 'Ichnites', en: 'Ichnites' },
    period: { ar: 'الترياسي', en: 'Triassic' },
    fact: { ar: 'الطول 27 سم · ثلاثة أصابع · مخلب واضح', en: 'Length 27 cm · three toes · clear claw mark' },
    tint: 0xb3a58b,
    book: {
      ar: 'أثر القدم ليس عظمًا، لكنه يحفظ حركة. الطين كان رطبًا حين مرّ الحيوان، ثم جفّ تحت الشمس وامتلأ بالرمل. المسافة بين هذا الأثر وأثر آخر ستخبرنا لاحقًا بطول خطوته وسرعته.',
      en: 'A footprint is not bone, but it preserves movement. The mud was wet when the animal passed, then dried in the sun and filled with sand. The distance to the next print will later tell us its stride and speed.',
    },
  },
  {
    id: 'coral', name: { ar: 'مرجان', en: 'Coral' }, latin: { ar: 'Anthozoa', en: 'Anthozoa' },
    period: { ar: 'الجوراسي', en: 'Jurassic' },
    fact: { ar: 'القطر 12 سم', en: 'Diameter 12 cm' },
    tint: 0xe07a5a,
    book: { ar: 'المرجان حيوان. المستعمرة بُنيت من إفرازات كل polyp.', en: 'Coral is an animal. The colony was built from polyp secretions.' },
  },
  {
    id: 'sharktooth', name: { ar: 'سن سمك قرش', en: 'Shark tooth' }, latin: { ar: 'Selachii', en: 'Selachii' },
    period: { ar: 'الطباشيري', en: 'Cretaceous' },
    fact: { ar: 'الطول 6.2 سم', en: 'Length 6.2 cm' },
    tint: 0xd4b483,
    book: { ar: 'أسنان أسماك القرش تُستبدل طوال الحياة.', en: 'Shark teeth are replaced throughout life.' },
  },
  {
    id: 'egg', name: { ar: 'بيضة ديناصور', en: 'Dinosaur egg' }, latin: { ar: 'Oolithes', en: 'Oolithes' },
    period: { ar: 'الطباشيري', en: 'Cretaceous' },
    fact: { ar: 'القطر 17 سم', en: 'Diameter 17 cm' },
    tint: 0xe8d5a8,
    book: { ar: 'البيضة محفوظة بقشرتها. العثور على بيضة كاملة نادر.', en: 'The egg is preserved with its shell. Finding a complete egg is rare.' },
  },
  {
    id: 'petrifiedwood', name: { ar: 'خشب متحجر', en: 'Petrified wood' }, latin: { ar: 'Lignum lapideum', en: 'Lignum lapideum' },
    period: { ar: 'الترياسي', en: 'Triassic' },
    fact: { ar: 'الطول 24 سم', en: 'Length 24 cm' },
    tint: 0x9c8a6b,
    book: { ar: 'الخشب متحجر: السيليكا حلّت محل الخلايا. هذه الشجرة عاشت قبل الديناصورات.', en: 'The wood is petrified: silica replaced the cells. This tree lived before dinosaurs.' },
  },
]

export const FOSSIL_IDS: FossilId[] = FOSSILS.map(f => f.id)
export const FOSSIL_BY_ID = Object.fromEntries(FOSSILS.map(f => [f.id, f])) as Record<FossilId, FossilType>
export const BONE_BY_LEVEL = (level: number): BonePart => BONE_PARTS[Math.min(BONE_PARTS.length - 1, Math.max(0, Math.floor(level) - 1))]

/** The ten campaign levels; Endless levels (11+) still work but have no new campaign bone. */
export const CAMPAIGN_LEVELS = 10
export const isCampaignLevel = (level: number) => level >= 1 && level <= CAMPAIGN_LEVELS

/** Which fossil types can appear for each artifact tier. */
export const FOSSIL_POOLS: Record<Tier, FossilId[]> = {
  common: ['trilobite', 'leaf', 'footprint', 'shell', 'coral', 'sharktooth', 'petrifiedwood'],
  rare: ['ammonite', 'fern', 'fish', 'egg'],
  legendary: ['insect'],
}

export function fossilPool(tier: Tier): FossilId[] {
  return FOSSIL_POOLS[tier]
}

/** Pick a fossil for a tier, preferring types not already used in this level. */
export function pickFossil(tier: Tier, used: Set<FossilId>, random: () => number): FossilId {
  const pool = FOSSIL_POOLS[tier]
  const available = pool.filter(id => !used.has(id))
  const from = available.length > 0 ? available : pool
  return from[Math.floor(random() * from.length) % from.length]
}

export const pendingBones = (bones: readonly number[], studied: readonly number[]): number[] =>
  bones.filter(id => !studied.includes(id))

export const pendingFossils = (
  fossils: Readonly<Record<string, number>>,
  studied: Readonly<Record<string, number>>,
): FossilId[] => FOSSIL_IDS.filter(id => (fossils[id] ?? 0) > (studied[id] ?? 0))

export const studiedBoneCount = (studied: readonly number[]) => new Set(studied).size
export const collectedFossilCount = (fossils: Readonly<Record<string, number>>) =>
  FOSSIL_IDS.filter(id => (fossils[id] ?? 0) > 0).length
