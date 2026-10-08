/**
 * Prakriti Bio - Product Requirements & Mock Data Store
 * Grounded in authentic bioenzyme chemistry, real organic waste reuse, and local sourcing in AP & Telangana.
 */

const INITIAL_PRODUCTS = [
  {
    id: "bioenzyme-concentrate",
    name: "Citrus Bioenzyme Cleaner Concentrate",
    category: "concentrate",
    categoryLabel: "Bioenzyme Concentrate",
    badge: "Bestseller",
    rating: 4.9,
    reviewCount: 42,
    shortDescription: "Pure 90-day cold-fermented citrus bioenzyme. An authentic multi-surface concentrate that naturally breaks down grease, biofilm, and odors.",
    image: "assets/images/bioenzyme.jpg",
    basePrice: 249,
    baseSize: "500 ml",
    stock: 85,
    inStock: true,
    variants: [
      { size: "500 ml", price: 249, inStock: true },
      { size: "1 L", price: 429, inStock: true },
      { size: "2 L", price: 799, inStock: true },
      { size: "3 L", price: 1149, inStock: true },
      { size: "4 L", price: 1499, inStock: true },
      { size: "5 L", price: 1799, inStock: true }
    ],
    customPricePerLiter: 360,
    minCustomLiters: 5,
    ingredients: [
      { name: "Fermented Citrus Peels", role: "Active Enzyme Source", detail: "Naturally contains Lipase, Amylase & Protease to digest grime and grease." },
      { name: "Unrefined Black Jaggery", role: "Microbial Catalyst", detail: "Provides essential nutrition for wild yeast and beneficial probiotics during the 90-day ferment." },
      { name: "De-chlorinated Water", role: "Ferment Medium", detail: "Tested for mineral purity and optimum microbial growth." },
      { name: "Cold-Pressed Sweet Orange Oil", role: "Natural Aroma", detail: "100% steam-distilled essential oil for subtle, natural freshness with zero synthetics." }
    ],
    usageGuide: [
      { surface: "Kitchen Countertops & Stoves", ratio: "1:20 (50ml in 1L water)", steps: "Spray on greasy areas, allow enzymes 2 minutes to loosen oils, wipe clean with damp cloth." },
      { surface: "Sink Drains & Odor Control", ratio: "1:5 or Undiluted", steps: "Pour 100ml directly down the kitchen or bathroom drain at night to digest organic pipe sludge." },
      { surface: "Bathroom Tiles & Glass", ratio: "1:30 (35ml in 1L water)", steps: "Spray on tile grout, leave for 5 minutes, scrub lightly and rinse." },
      { surface: "Garden Soil & Composting", ratio: "1:100 (10ml in 1L water)", steps: "Diluted wash runoff can be poured directly into house plants to condition soil." }
    ],
    safetyInfo: "Slight natural sediment is normal in raw bioenzyme ferments. Keep container tightly capped in a cool, shaded area away from direct sunlight. Do not ingest. In case of eye contact, rinse thoroughly with fresh water.",
    environmentalFacts: [
      "Diverts 1.8 kg of fresh citrus peels from Hyderabad & Vijayawada fruit stalls per liter.",
      "100% Greywater safe: runoff breaks down organically in drainage waterways without algae-blooming phosphates.",
      "Compostable byproduct: Spent solids are converted into carbon-rich organic garden compost."
    ]
  },
  {
    id: "dishwash-liquid",
    name: "Natural Dishwash Liquid (Citrus & Soapnut)",
    category: "kitchen",
    categoryLabel: "Kitchen Cleaning",
    badge: "Plant Powered",
    rating: 4.8,
    reviewCount: 38,
    shortDescription: "Gentle on hands, ruthless on grease. Infused with organic soapnut (Reetha) extract and active citrus bioenzymes to cut burnt oil without leaving chemical film.",
    image: "assets/images/dishwash.jpg",
    basePrice: 189,
    baseSize: "500 ml",
    stock: 120,
    inStock: true,
    variants: [
      { size: "500 ml", price: 189, inStock: true },
      { size: "1 L", price: 349, inStock: true },
      { size: "2 L", price: 649, inStock: true },
      { size: "3 L", price: 929, inStock: true },
      { size: "4 L", price: 1199, inStock: true },
      { size: "5 L", price: 1449, inStock: true }
    ],
    customPricePerLiter: 290,
    minCustomLiters: 5,
    ingredients: [
      { name: "Citrus Bioenzyme", role: "Grease Dissolver", detail: "Breaks down cooked cooking oil and starch crusts naturally." },
      { name: "Organic Soapnut (Reetha) Decoction", role: "Natural Saponin Surfactant", detail: "Generates gentle, biodegradable lather that lifts food debris without synthetic surfactants." },
      { name: "Vegetable Glycerin", role: "Skin Conditioner", detail: "Keeps hands soft, moisturized, and free of peeling even after multiple washes." },
      { name: "Lemon Peel Extract", role: "Odor Neutralizer", detail: "Eliminates strong food smells like onion, garlic, and fish from stainless steel and glassware." }
    ],
    usageGuide: [
      { surface: "Daily Tableware & Glassware", ratio: "1-2 pumps in water bowl", steps: "Dilute 1 tsp in a small bowl of water, apply with coconut coir or sponge, rinse clean." },
      { surface: "Greasy Kadhais & Non-Stick Pans", ratio: "Direct application", steps: "Apply 1-2 drops directly onto tough grease, let sit for 3 minutes, then scrub gently." }
    ],
    safetyInfo: "Safe for baby feeding bottles and infant utensils. Free from triclosan, synthetic foaming agents (SLS/SLES), artificial dyes, and parabens.",
    environmentalFacts: [
      "Leaves zero chemical film on dishes: eliminates accidental micro-chemical ingestion.",
      "100% biodegradable wash water, safe for home greywater filtering systems.",
      "Packaging manufactured with high-density recyclable HDPE."
    ]
  },
  {
    id: "floor-cleaner",
    name: "Citrus Floor Cleaner (Safe for Pets & Kids)",
    category: "floor",
    categoryLabel: "Floor & Surface",
    badge: "Pet & Baby Safe",
    rating: 4.9,
    reviewCount: 56,
    shortDescription: "A gentle yet effective botanical floor cleaner powered by citrus bioenzyme and eucalyptus oil. Removes dirt, deters ants, and leaves zero sticky residue.",
    image: "assets/images/floor_cleaner.jpg",
    basePrice: 229,
    baseSize: "1 L",
    stock: 95,
    inStock: true,
    variants: [
      { size: "1 L", price: 229, inStock: true },
      { size: "2 L", price: 429, inStock: true },
      { size: "3 L", price: 619, inStock: true },
      { size: "4 L", price: 799, inStock: true },
      { size: "5 L", price: 969, inStock: true }
    ],
    customPricePerLiter: 200,
    minCustomLiters: 5,
    ingredients: [
      { name: "Active Citrus Bioenzyme", role: "Surface Deep Cleaner", detail: "Digest dirt and grime trapped in grout and porous stone tiles." },
      { name: "Nilgiri Eucalyptus Essential Oil", role: "Natural Insect Deterrent", detail: "Deters flies, ants, and pests without chemical neurotoxins." },
      { name: "Soapnut Extract", role: "Gentle Cleanse", detail: "Provides mild foaming that dries streak-free on all surfaces." },
      { name: "Purified Water", role: "Carrier", detail: "De-ionized water base for crystal-clear finish." }
    ],
    usageGuide: [
      { surface: "Marble, Granite & Vitrified Tiles", ratio: "1 cap (30ml) per 5L bucket", steps: "Add to half a bucket of water, mop the floor as usual. No need to rinse with plain water." },
      { surface: "Hardwood & Parquet Floors", ratio: "Half cap (15ml) per 5L bucket", steps: "Use well-wrung microfiber mop for streak-free natural sheen." }
    ],
    safetyInfo: "Completely safe for crawling infants and pets who lick their paws. Contains zero harmful phenyls, chlorine bleach, or artificial pine fragrances.",
    environmentalFacts: [
      "Floor mop water can be safely dumped into garden soil or balcony plant pots.",
      "Prevents hazardous chemical runoff into municipal groundwater systems.",
      "Bottled in recycled materials with refill options available across Hyderabad."
    ]
  },
  {
    id: "laundry-detergent",
    name: "Eco-Pure Laundry Detergent Liquid",
    category: "laundry",
    categoryLabel: "Laundry Care",
    badge: "Fabric Gentle",
    rating: 4.7,
    reviewCount: 29,
    shortDescription: "Plant-derived laundry liquid with enzyme cleaning power. Dissolves sweat, soil, and stains while preserving fabric softness and color brilliance.",
    image: "assets/images/laundry.jpg",
    basePrice: 299,
    baseSize: "1 L",
    stock: 64,
    inStock: true,
    variants: [
      { size: "1 L", price: 299, inStock: true },
      { size: "2 L", price: 569, inStock: true },
      { size: "3 L", price: 819, inStock: true },
      { size: "4 L", price: 1049, inStock: true },
      { size: "5 L", price: 1279, inStock: true }
    ],
    customPricePerLiter: 260,
    minCustomLiters: 5,
    ingredients: [
      { name: "Bioenzyme Protease & Amylase", role: "Stain Dissolver", detail: "Breaks down protein and starch stains (sweat, food spills, grass) at low water temperatures." },
      { name: "Soapnut & Coconut Glucoside", role: "Natural Detergent", detail: "Gentle botanical surfactant that lifts soil without damaging delicate cotton or silk fibers." },
      { name: "Baking Soda (Sodium Bicarbonate)", role: "Natural Softener & Deodorizer", detail: "Neutralizes sweat odors and balances wash pH." },
      { name: "Lavender Essential Oil", role: "Calming Scent", detail: "Subtle, natural botanical freshness without synthetic fragrance allergens." }
    ],
    usageGuide: [
      { surface: "Top Load / Front Load Washing Machines", ratio: "40ml per 6kg load", steps: "Pour directly into detergent compartment. Suitable for cold and warm wash cycles." },
      { surface: "Hand Wash & Delicate Garments", ratio: "20ml in 10L water", steps: "Soak clothes for 15 minutes, wash gently, and rinse. Requires 50% less rinse water than synthetic detergents." }
    ],
    safetyInfo: "Dermatologically friendly. Ideal for baby clothes, cloth diapers, and sensitive skin prone to eczema or itching.",
    environmentalFacts: [
      "Zero phosphates: stops toxic algae growth in local lakes and rivers.",
      "Low lather formula reduces household washing machine water consumption by up to 20-30%.",
      "Washing machine runoff water is non-toxic and greywater-safe."
    ]
  },
  {
    id: "herbal-shampoo",
    name: "Natural Botanical Herbal Shampoo",
    category: "personal",
    categoryLabel: "Personal Care",
    badge: "Sulfate-Free",
    rating: 4.8,
    reviewCount: 34,
    shortDescription: "Traditional scalp-clarifying shampoo crafted with fermented citrus enzymes, Shikakai, Amla, and wild Reetha. Cleanses gently while revitalizing root strength.",
    image: "assets/images/shampoo.jpg",
    basePrice: 349,
    baseSize: "500 ml",
    stock: 50,
    inStock: true,
    variants: [
      { size: "250 ml", price: 199, inStock: true },
      { size: "500 ml", price: 349, inStock: true },
      { size: "1 L", price: 649, inStock: true },
      { size: "2 L", price: 1199, inStock: true }
    ],
    customPricePerLiter: 600,
    minCustomLiters: 3,
    ingredients: [
      { name: "Fermented Citrus & Aloe Vera Enzyme", role: "Scalp Exfoliant & Hydrator", detail: "Clears dandruff flaking and excess sebum while restoring natural scalp pH (5.5)." },
      { name: "Organic Shikakai (Acacia Concinna)", role: "Hair Cleanser & Detangler", detail: "Gently cleanses hair strands without stripping natural protective oils." },
      { name: "Wild Indian Gooseberry (Amla)", role: "Follicle Nourisher", detail: "Rich in vitamin C and polyphenols to encourage healthy, glossy growth." },
      { name: "Reetha (Soapnut)", role: "Botanical Lather", detail: "Mild plant saponins that rinse clean without plasticizing silicones." }
    ],
    usageGuide: [
      { surface: "Daily Scalp Wash", ratio: "5-10 ml on wet scalp", steps: "Massage gently onto scalp with fingertips for 2 minutes to stimulate circulation, then rinse with cool water." }
    ],
    safetyInfo: "Zero sulfates (SLS/SLES), zero parabens, zero synthetic silicones, zero artificial dyes. Suitable for all hair types and color-treated hair.",
    environmentalFacts: [
      "Bathroom shower runoff is 100% natural and harmless to sewage biologies.",
      "Crafted with locally foraged herbs from the Eastern Ghats and sustainable farms."
    ]
  },
  {
    id: "bundle-zero-waste-home",
    name: "Zero-Waste Home Starter Kit (4-in-1)",
    category: "bundle",
    categoryLabel: "Curated Bundles",
    badge: "Save 16%",
    rating: 5.0,
    reviewCount: 22,
    shortDescription: "Complete home transition kit to eliminate synthetic chemicals: Bioenzyme Concentrate (1L) + Dishwash (1L) + Floor Cleaner (1L) + Laundry Liquid (1L) in a recycled gift box.",
    image: "assets/images/hero.jpg",
    basePrice: 1099,
    baseSize: "4 x 1L Pack",
    stock: 35,
    inStock: true,
    variants: [
      { size: "4 x 1L Pack", price: 1099, inStock: true },
      { size: "4 x 2L Family Pack", price: 2099, inStock: true }
    ],
    customPricePerLiter: null,
    ingredients: [
      { name: "Complete Home Trio & Laundry", role: "Multi-functional", detail: "Covers all surface, dish, floor, and fabric cleaning needs without a single synthetic cleaner." }
    ],
    usageGuide: [
      { surface: "Whole House Routine", ratio: "Follow individual bottle guides", steps: "Includes reusable measurement cap and detailed dilution chart magnet." }
    ],
    safetyInfo: "All 4 products in this kit are pet-safe, infant-safe, and greywater-friendly.",
    environmentalFacts: [
      "Diverts over 7.5 kg of fresh citrus peels from landfill disposal.",
      "Eliminates up to 12 synthetic plastic bottles over a 6-month period."
    ]
  }
];

const INITIAL_COUPONS = [
  { code: "FIRSTBIO10", discountPercent: 10, minOrder: 399, description: "10% off your first order", active: true },
  { code: "APTGSHIPPING", discountPercent: 0, freeShipping: true, minOrder: 0, description: "Free shipping across Andhra Pradesh & Telangana", active: true },
  { code: "CLEANBULK", discountPercent: 15, minOrder: 1500, description: "15% discount for bulk & community orders above ₹1500", active: true }
];

const INITIAL_JOURNAL = [
  {
    id: "art-3-1-10-ratio",
    title: "The 3:1:10 Golden Ratio: The True Science of Citrus Bioenzyme",
    date: "October 2026",
    author: "Dr. K. Srinivas, Environmental Microbiologist",
    readTime: "4 min read",
    tag: "Science & Fermentation",
    excerpt: "Why the precise proportion of 3 parts citrus peel, 1 part raw jaggery, and 10 parts water creates an anaerobic haven for enzyme-producing beneficial microbes.",
    content: `
      <p>Bioenzymes are not magic—they are the result of controlled, natural microbial fermentation. For decades, traditional Indian households used soapnuts and citrus rinds for cleaning. Modern bioenzyme production refines this through the classic 3:1:10 formula:</p>
      <ul>
        <li><strong>3 Parts Fresh Citrus Peels:</strong> Rich in citric acid, d-limonene, and microbial flora. Orange, sweet lime (Mosambi), and lemon peels collected from local juice stalls provide the ideal biological substrate.</li>
        <li><strong>1 Part Unrefined Jaggery:</strong> Pure organic jaggery provides sucrose, fructose, and trace minerals that nourish wild yeasts and lactic acid bacteria without the bleaching agents found in refined white sugar.</li>
        <li><strong>10 Parts Dechlorinated Water:</strong> Provides the liquid ecosystem in which metabolic conversion takes place.</li>
      </ul>
      <p>Over a rigorous 90-day anaerobic cycle, beneficial bacteria produce active hydrolytic enzymes—principally <em>lipase</em> (which breaks down fats and cooking oils), <em>protease</em> (which digests organic protein residues), and <em>amylase</em> (which lifts starch deposits). The resulting amber liquid has a natural pH between 3.5 and 4.0, making it mildly acidic and inherently antimicrobial without any chlorine or synthetic phenols.</p>
    `
  },
  {
    id: "art-greywater-gardening",
    title: "Greywater Gardening: How Bioenzyme Cleaning Water Nourishes Soil",
    date: "September 2026",
    author: "Ananya Rao, Sustainable Living Advocate",
    readTime: "5 min read",
    tag: "Sustainable Living",
    excerpt: "When you clean your floor with bioenzymes, your mop water isn't toxic waste—it becomes a micro-nutrient booster for your balcony plants and garden.",
    content: `
      <p>Most commercial floor and dish cleaners contain synthetic surfactants, linear alkylbenzene sulfonate, and artificial fragrance compounds. When flushed down the drain, this water poisons municipal sewage bacteria and pollutes groundwater tables.</p>
      <p>In contrast, bioenzyme wash runoff contains living beneficial microbes and natural organic acids. When diluted floor cleaner runoff is poured around tomato plants, curry leaf bushes, or ornamental greens, it performs three vital functions:</p>
      <ol>
        <li><strong>Conditions compacted soil:</strong> Organic enzymes help loosen clay soil particles, improving root aeration.</li>
        <li><strong>Deters soil-borne pathogens:</strong> The mildly acidic pH and probiotic flora outcompete harmful fungal spores.</li>
        <li><strong>Reduces municipal water demand:</strong> Up to 100 liters of household cleaning water per week can be re-circulated directly into urban gardens instead of going to waste.</li>
      </ol>
    `
  },
  {
    id: "art-ap-tg-local-impact",
    title: "Diverting Market Peel Waste Across Hyderabad and Vijayawada",
    date: "August 2026",
    author: "Prakriti Bio Sustainability Team",
    readTime: "3 min read",
    tag: "Local Impact",
    excerpt: "Behind the scenes of our daily citrus peel collection network across fruit markets in Andhra Pradesh and Telangana.",
    content: `
      <p>Every morning across the fruit markets of Kothapet, Gaddiannaram, and Vijayawada Benz Circle, hundreds of sugarcane and citrus juice vendors dispose of fragrant orange and sweet lime rinds. Historically, this biomass ended up in municipal landfills, producing methane as it decayed in anaerobic dumps.</p>
      <p>Our decentralized collection initiative partners directly with local juice vendors. We provide food-grade collection bins and retrieve fresh citrus peels daily within 6 hours of juicing. These peels are inspected, washed, and transferred immediately into our fermentation tanks.</p>
      <p>In the past year alone, this model has successfully diverted over 14 tonnes of organic citrus waste, transforming what was once city garbage into non-toxic cleaning essentials for thousands of households across Telangana and Andhra Pradesh.</p>
    `
  }
];

const INITIAL_REVIEWS = [
  {
    productId: "bioenzyme-concentrate",
    author: "Dr. Ramana Murthy",
    location: "Gachibowli, Hyderabad",
    rating: 5,
    date: "14 Sep 2026",
    verified: true,
    title: "Remarkable for kitchen grease and zero chemical smell",
    content: "We switched to Prakriti Bioenzyme for our kitchen chimney and cooktop grease. It takes about 2-3 minutes of contact time to dissolve grease, and the subtle citrus scent is completely natural. No coughing or stinging eyes like with commercial degreasers."
  },
  {
    productId: "bioenzyme-concentrate",
    author: "Pavani K.",
    location: "Benz Circle, Vijayawada",
    rating: 5,
    date: "02 Sep 2026",
    verified: true,
    title: "Cleared bathroom drain odors permanently",
    content: "Pouring 100ml directly down the shower drain before sleeping eliminated the musty biofilm smell in two days. Truly grateful for an authentic local product that does not use chlorine."
  },
  {
    productId: "dishwash-liquid",
    author: "Sowmya Reddy",
    location: "Kukatpally, Hyderabad",
    rating: 5,
    date: "28 Aug 2026",
    verified: true,
    title: "My hands stopped peeling!",
    content: "Synthetic dishwash bars always gave me dermatitis. This soapnut and citrus formula is remarkably soft on hands and cleans oily stainless steel pressure cookers effortlessly."
  },
  {
    productId: "floor-cleaner",
    author: "Vikram Varma",
    location: "Madhapur, Hyderabad",
    rating: 5,
    date: "18 Aug 2026",
    verified: true,
    title: "Safe for our golden retriever who licks the floor",
    content: "With pets at home, ordinary phenyls and pine cleaners were always a concern. This citrus floor cleaner dries clean without leaving any chemical residue or slick film."
  },
  {
    productId: "laundry-detergent",
    author: "Haritha N.",
    location: "Visakhapatnam",
    rating: 5,
    date: "10 Aug 2026",
    verified: true,
    title: "Leaves cottons soft without toxic fabric softeners",
    content: "Excellent performance in our front load washing machine. Removes sweat stains easily and clothes come out smelling like fresh air and subtle lavender."
  }
];

const SAMPLE_ORDERS = [
  {
    orderId: "PB-2026-8941",
    customerName: "Srinivas Rao",
    phone: "+91 98480 22314",
    email: "srinivas.rao@gmail.com",
    address: {
      flat: "Flat 402, Green Meadows",
      street: "Road No. 12, Banjara Hills",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500034"
    },
    items: [
      { id: "bioenzyme-concentrate", name: "Citrus Bioenzyme Cleaner Concentrate", size: "2 L", quantity: 1, unitPrice: 799 },
      { id: "dishwash-liquid", name: "Natural Dishwash Liquid (Citrus & Soapnut)", size: "1 L", quantity: 2, unitPrice: 349 }
    ],
    subtotal: 1497,
    discount: 149.7,
    couponCode: "FIRSTBIO10",
    deliveryFee: 0,
    total: 1347.3,
    paymentMethod: "Online UPI",
    paymentStatus: "Paid",
    status: "Shipped",
    statusTimeline: [
      { status: "Order Placed", timestamp: "01 Oct 2026, 09:30 AM", note: "Order placed successfully" },
      { status: "Confirmed", timestamp: "01 Oct 2026, 11:15 AM", note: "Verified by operations team" },
      { status: "Packed", timestamp: "01 Oct 2026, 03:45 PM", note: "Packed in recyclable corrugated box" },
      { status: "Shipped", timestamp: "02 Oct 2026, 08:30 AM", note: "Dispatched via AP-TG Express Courier" }
    ],
    courierName: "AP-TG Express Courier",
    trackingNumber: "APTG-7782014-HYD",
    trackingUrl: "https://tracking.aptgexpress.in/track/APTG-7782014-HYD",
    createdDate: "2026-10-01T04:00:00.000Z"
  }
];
