const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'prakriti.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for high performance and durability
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Helper for password hashing
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  try {
    const checkHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(checkHash, 'hex'));
  } catch (err) {
    return false;
  }
}

// Initialize Tables
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      permissions TEXT NOT NULL, -- JSON array
      status TEXT NOT NULL DEFAULT 'active',
      avatar TEXT,
      created_at TEXT NOT NULL,
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      addresses TEXT NOT NULL DEFAULT '[]', -- JSON array
      created_at TEXT NOT NULL,
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_type TEXT NOT NULL, -- 'customer' or 'admin'
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      category_label TEXT NOT NULL,
      badge TEXT,
      rating REAL DEFAULT 5.0,
      review_count INTEGER DEFAULT 0,
      short_description TEXT NOT NULL,
      image TEXT NOT NULL,
      base_price REAL NOT NULL,
      base_size TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 50,
      in_stock INTEGER NOT NULL DEFAULT 1,
      variants TEXT NOT NULL, -- JSON array
      custom_price_per_liter REAL,
      min_custom_liters INTEGER,
      ingredients TEXT NOT NULL, -- JSON array
      usage_guide TEXT NOT NULL, -- JSON array
      safety_info TEXT,
      environmental_facts TEXT, -- JSON array
      status TEXT NOT NULL DEFAULT 'published', -- 'published', 'draft', 'unpublished', 'archived'
      display_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_logs (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      change_amount INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference_id TEXT,
      admin_name TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS favorites (
      customer_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (customer_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS carts (
      customer_id TEXT PRIMARY KEY,
      items TEXT NOT NULL DEFAULT '[]', -- JSON array
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL, -- JSON object
      delivery_notes TEXT,
      items TEXT NOT NULL, -- JSON array (historical prices preserved)
      subtotal REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      coupon_code TEXT,
      delivery_fee REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'Pending',
      status TEXT NOT NULL DEFAULT 'Order Placed',
      courier_name TEXT,
      tracking_number TEXT,
      tracking_url TEXT,
      status_timeline TEXT NOT NULL, -- JSON array
      action_request TEXT, -- JSON object for cancellation / return requests
      idempotency_key TEXT UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      discount_percent INTEGER DEFAULT 0,
      discount_fixed REAL DEFAULT 0,
      free_shipping INTEGER DEFAULT 0,
      min_order REAL DEFAULT 0,
      max_discount REAL,
      usage_limit INTEGER,
      times_used INTEGER DEFAULT 0,
      per_customer_limit INTEGER DEFAULT 1,
      start_date TEXT,
      expiry_date TEXT,
      active INTEGER DEFAULT 1,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coupon_usages (
      id TEXT PRIMARY KEY,
      coupon_code TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      author TEXT NOT NULL,
      read_time TEXT NOT NULL,
      tag TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      content TEXT NOT NULL,
      cover_image TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      seo_title TEXT,
      seo_description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS enquiries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      organization TEXT,
      location TEXT NOT NULL,
      type TEXT NOT NULL, -- 'contact' or 'b2b_bulk'
      estimated_liters TEXT,
      application TEXT,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'New', -- 'New', 'Contacted', 'In Progress', 'Converted', 'Closed'
      assigned_admin TEXT,
      internal_notes TEXT,
      follow_up_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      customer_id TEXT,
      author TEXT NOT NULL,
      location TEXT NOT NULL,
      rating INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'approved', -- 'approved', 'hidden', 'pending'
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_type TEXT NOT NULL, -- 'customer' or 'admin'
      recipient_id TEXT NOT NULL, -- customer_id or 'all_admins' or admin_id
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT,
      admin_name TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      details TEXT, -- JSON
      result TEXT NOT NULL DEFAULT 'SUCCESS',
      ip_address TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

// Seed Initial Data if tables are empty
function seedData() {
  const now = new Date().toISOString();

  // 1. Seed Admins
  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admins').get().count;
  if (adminCount === 0) {
    const superAdminPass = hashPassword('Admin@Prakriti2026!');
    db.prepare(`
      INSERT INTO admins (id, name, email, password_hash, salt, role, permissions, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'admin_super_1',
      'Super Administrator',
      'admin@prakritibio.in',
      superAdminPass.hash,
      superAdminPass.salt,
      'super_admin',
      JSON.stringify(['products', 'inventory', 'orders', 'customers', 'journal', 'coupons', 'enquiries', 'reports', 'admins', 'audit_log']),
      'active',
      now
    );

    const managerPass = hashPassword('Manager@Prakriti2026!');
    db.prepare(`
      INSERT INTO admins (id, name, email, password_hash, salt, role, permissions, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'admin_mgr_1',
      'Operations Manager',
      'manager@prakritibio.in',
      managerPass.hash,
      managerPass.salt,
      'admin',
      JSON.stringify(['products', 'inventory', 'orders', 'customers', 'journal', 'coupons', 'enquiries', 'reports']),
      'active',
      now
    );

    const staffPass = hashPassword('Staff@Prakriti2026!');
    db.prepare(`
      INSERT INTO admins (id, name, email, password_hash, salt, role, permissions, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'admin_staff_1',
      'Fulfillment Staff',
      'staff@prakritibio.in',
      staffPass.hash,
      staffPass.salt,
      'staff',
      JSON.stringify(['orders', 'inventory']),
      'active',
      now
    );

    db.prepare(`
      INSERT INTO audit_logs (id, admin_id, admin_name, action, target_type, target_id, details, result, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'audit_init_1',
      'system',
      'System Initializer',
      'SYSTEM_INITIALIZE',
      'system',
      'system',
      JSON.stringify({ message: 'Initialized Prakriti Bio relational database with default administrator accounts.' }),
      'SUCCESS',
      now
    );
  }

  // 2. Seed Customers
  const customerCount = db.prepare('SELECT COUNT(*) as count FROM customers').get().count;
  if (customerCount === 0) {
    const cust1Pass = hashPassword('Customer@123');
    const cust1Addresses = [
      {
        id: 'addr_1',
        isDefault: true,
        fullName: 'Srinivas Rao',
        phone: '+91 98480 22314',
        flat: 'Flat 402, Green Meadows',
        street: 'Road No. 12, Banjara Hills',
        city: 'Hyderabad',
        district: 'Rangareddy',
        state: 'Telangana',
        pincode: '500034'
      }
    ];

    db.prepare(`
      INSERT INTO customers (id, name, email, phone, password_hash, salt, status, addresses, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'cust_1',
      'Srinivas Rao',
      'customer@example.com',
      '+91 98480 22314',
      cust1Pass.hash,
      cust1Pass.salt,
      'active',
      JSON.stringify(cust1Addresses),
      now
    );

    const cust2Pass = hashPassword('Customer@123');
    const cust2Addresses = [
      {
        id: 'addr_2',
        isDefault: true,
        fullName: 'Ananya Rao',
        phone: '+91 98480 55678',
        flat: 'Flat 101, Lotus Apartments',
        street: 'MG Road, Near Benz Circle',
        city: 'Vijayawada',
        district: 'Krishna',
        state: 'Andhra Pradesh',
        pincode: '520010'
      }
    ];

    db.prepare(`
      INSERT INTO customers (id, name, email, phone, password_hash, salt, status, addresses, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'cust_2',
      'Ananya Rao',
      'ananya@example.com',
      '+91 98480 55678',
      cust2Pass.hash,
      cust2Pass.salt,
      'active',
      JSON.stringify(cust2Addresses),
      now
    );
  }

  // 3. Seed Products
  const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  if (prodCount === 0) {
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
        inStock: 1,
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
        ],
        status: "published",
        displayOrder: 1
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
        inStock: 1,
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
        ],
        status: "published",
        displayOrder: 2
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
        inStock: 1,
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
        ],
        status: "published",
        displayOrder: 3
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
        inStock: 1,
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
        ],
        status: "published",
        displayOrder: 4
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
        inStock: 1,
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
        ],
        status: "published",
        displayOrder: 5
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
        inStock: 1,
        variants: [
          { size: "4 x 1L Pack", price: 1099, inStock: true },
          { size: "4 x 2L Family Pack", price: 2099, inStock: true }
        ],
        customPricePerLiter: null,
        minCustomLiters: null,
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
        ],
        status: "published",
        displayOrder: 6
      }
    ];

    const insertProd = db.prepare(`
      INSERT INTO products (
        id, name, category, category_label, badge, rating, review_count, short_description,
        image, base_price, base_size, stock, in_stock, variants, custom_price_per_liter,
        min_custom_liters, ingredients, usage_guide, safety_info, environmental_facts,
        status, display_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    INITIAL_PRODUCTS.forEach(p => {
      insertProd.run(
        p.id,
        p.name,
        p.category,
        p.categoryLabel,
        p.badge,
        p.rating,
        p.reviewCount,
        p.shortDescription,
        p.image,
        p.basePrice,
        p.baseSize,
        p.stock,
        p.inStock,
        JSON.stringify(p.variants),
        p.customPricePerLiter,
        p.minCustomLiters,
        JSON.stringify(p.ingredients),
        JSON.stringify(p.usageGuide),
        p.safetyInfo,
        JSON.stringify(p.environmentalFacts),
        p.status,
        p.displayOrder,
        now,
        now
      );

      // Log initial inventory
      db.prepare(`
        INSERT INTO inventory_logs (id, product_id, change_amount, previous_stock, new_stock, reason, reference_id, admin_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'inv_init_' + p.id,
        p.id,
        p.stock,
        0,
        p.stock,
        'initial_catalog_seed',
        'SYSTEM',
        'System Initializer',
        now
      );
    });
  }

  // 4. Seed Coupons
  const couponCount = db.prepare('SELECT COUNT(*) as count FROM coupons').get().count;
  if (couponCount === 0) {
    const insertCoupon = db.prepare(`
      INSERT INTO coupons (id, code, discount_percent, discount_fixed, free_shipping, min_order, max_discount, usage_limit, times_used, description, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertCoupon.run('cp_1', 'FIRSTBIO10', 10, 0, 0, 399, 200, 1000, 1, '10% off your first order', 1);
    insertCoupon.run('cp_2', 'APTGSHIPPING', 0, 0, 1, 0, null, 1000, 0, 'Free shipping across Andhra Pradesh & Telangana', 1);
    insertCoupon.run('cp_3', 'CLEANBULK', 15, 0, 0, 1500, 500, 500, 0, '15% discount for bulk & community orders above ₹1500', 1);
  }

  // 5. Seed Journal
  const journalCount = db.prepare('SELECT COUNT(*) as count FROM journal').get().count;
  if (journalCount === 0) {
    const insertJournal = db.prepare(`
      INSERT INTO journal (id, title, slug, date, author, read_time, tag, excerpt, content, cover_image, status, seo_title, seo_description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertJournal.run(
      'art-3-1-10-ratio',
      'The 3:1:10 Golden Ratio: The True Science of Citrus Bioenzyme',
      '3-1-10-golden-ratio-citrus-bioenzyme-science',
      'October 2026',
      'Dr. K. Srinivas, Environmental Microbiologist',
      '4 min read',
      'Science & Fermentation',
      'Why the precise proportion of 3 parts citrus peel, 1 part raw jaggery, and 10 parts water creates an anaerobic haven for enzyme-producing beneficial microbes.',
      `<p>Bioenzymes are not magic—they are the result of controlled, natural microbial fermentation. For decades, traditional Indian households used soapnuts and citrus rinds for cleaning. Modern bioenzyme production refines this through the classic 3:1:10 formula:</p>
      <ul>
        <li><strong>3 Parts Fresh Citrus Peels:</strong> Rich in citric acid, d-limonene, and microbial flora. Orange, sweet lime (Mosambi), and lemon peels collected from local juice stalls provide the ideal biological substrate.</li>
        <li><strong>1 Part Unrefined Jaggery:</strong> Pure organic jaggery provides sucrose, fructose, and trace minerals that nourish wild yeasts and lactic acid bacteria without the bleaching agents found in refined white sugar.</li>
        <li><strong>10 Parts Dechlorinated Water:</strong> Provides the liquid ecosystem in which metabolic conversion takes place.</li>
      </ul>
      <p>Over a rigorous 90-day anaerobic cycle, beneficial bacteria produce active hydrolytic enzymes—principally <em>lipase</em> (which breaks down fats and cooking oils), <em>protease</em> (which digests organic protein residues), and <em>amylase</em> (which lifts starch deposits). The resulting amber liquid has a natural pH between 3.5 and 4.0, making it mildly acidic and inherently antimicrobial without any chlorine or synthetic phenols.</p>`,
      'assets/images/hero.jpg',
      'published',
      'The 3:1:10 Golden Ratio Science | Prakriti Bio',
      'Detailed scientific explanation of citrus bioenzyme fermentation ratios and microbiological enzymes.',
      now,
      now
    );

    insertJournal.run(
      'art-greywater-gardening',
      'Greywater Gardening: How Bioenzyme Cleaning Water Nourishes Soil',
      'greywater-gardening-bioenzyme-nourishes-soil',
      'September 2026',
      'Ananya Rao, Sustainable Living Advocate',
      '5 min read',
      'Sustainable Living',
      'When you clean your floor with bioenzymes, your mop water isn\'t toxic waste—it becomes a micro-nutrient booster for your balcony plants and garden.',
      `<p>Most commercial floor and dish cleaners contain synthetic surfactants, linear alkylbenzene sulfonate, and artificial fragrance compounds. When flushed down the drain, this water poisons municipal sewage bacteria and pollutes groundwater tables.</p>
      <p>In contrast, bioenzyme wash runoff contains living beneficial microbes and natural organic acids. When diluted floor cleaner runoff is poured around tomato plants, curry leaf bushes, or ornamental greens, it performs three vital functions:</p>
      <ol>
        <li><strong>Conditions compacted soil:</strong> Organic enzymes help loosen clay soil particles, improving root aeration.</li>
        <li><strong>Deters soil-borne pathogens:</strong> The mildly acidic pH and probiotic flora outcompete harmful fungal spores.</li>
        <li><strong>Reduces municipal water demand:</strong> Up to 100 liters of household cleaning water per week can be re-circulated directly into urban gardens instead of going to waste.</li>
      </ol>`,
      'assets/images/floor_cleaner.jpg',
      'published',
      'Greywater Gardening with Bioenzymes | Prakriti Bio',
      'Learn how household bioenzyme cleaning runoff can safely nourish urban home gardens and improve soil health.',
      now,
      now
    );

    insertJournal.run(
      'art-ap-tg-local-impact',
      'Diverting Market Peel Waste Across Hyderabad and Vijayawada',
      'diverting-citrus-waste-hyderabad-vijayawada',
      'August 2026',
      'Prakriti Bio Sustainability Team',
      '3 min read',
      'Local Impact',
      'Behind the scenes of our daily citrus peel collection network across fruit markets in Andhra Pradesh and Telangana.',
      `<p>Every morning across the fruit markets of Kothapet, Gaddiannaram, and Vijayawada Benz Circle, hundreds of sugarcane and citrus juice vendors dispose of fragrant orange and sweet lime rinds. Historically, this biomass ended up in municipal landfills, producing methane as it decayed in anaerobic dumps.</p>
      <p>Our decentralized collection initiative partners directly with local juice vendors. We provide food-grade collection bins and retrieve fresh citrus peels daily within 6 hours of juicing. These peels are inspected, washed, and transferred immediately into our fermentation tanks.</p>
      <p>In the past year alone, this model has successfully diverted over 14 tonnes of organic citrus waste, transforming what was once city garbage into non-toxic cleaning essentials for thousands of households across Telangana and Andhra Pradesh.</p>`,
      'assets/images/bioenzyme.jpg',
      'published',
      'Peel Waste Diversion in Hyderabad & Vijayawada | Prakriti Bio',
      'How Prakriti Bio diverts tonnes of citrus waste from landfills into natural bioenzyme cleaners.',
      now,
      now
    );
  }

  // 6. Seed Sample Order
  const orderCount = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  if (orderCount === 0) {
    const sampleItems = [
      { id: "bioenzyme-concentrate", productId: "bioenzyme-concentrate", name: "Citrus Bioenzyme Cleaner Concentrate", size: "2 L", quantity: 1, unitPrice: 799 },
      { id: "dishwash-liquid", productId: "dishwash-liquid", name: "Natural Dishwash Liquid (Citrus & Soapnut)", size: "1 L", quantity: 2, unitPrice: 349 }
    ];

    const sampleAddress = {
      flat: "Flat 402, Green Meadows",
      street: "Road No. 12, Banjara Hills",
      city: "Hyderabad",
      district: "Rangareddy",
      state: "Telangana",
      pincode: "500034"
    };

    const sampleTimeline = [
      { status: "Order Placed", timestamp: "01 Oct 2026, 09:30 AM", note: "Order placed successfully" },
      { status: "Confirmed", timestamp: "01 Oct 2026, 11:15 AM", note: "Verified by operations team" },
      { status: "Packed", timestamp: "01 Oct 2026, 03:45 PM", note: "Packed in recyclable corrugated box" },
      { status: "Shipped", timestamp: "02 Oct 2026, 08:30 AM", note: "Dispatched via AP-TG Express Courier" }
    ];

    db.prepare(`
      INSERT INTO orders (
        order_id, customer_id, customer_name, email, phone, address, items,
        subtotal, discount, coupon_code, delivery_fee, total, payment_method,
        payment_status, status, courier_name, tracking_number, tracking_url,
        status_timeline, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'PB-2026-8941',
      'cust_1',
      'Srinivas Rao',
      'customer@example.com',
      '+91 98480 22314',
      JSON.stringify(sampleAddress),
      JSON.stringify(sampleItems),
      1497,
      149.7,
      'FIRSTBIO10',
      0,
      1347.3,
      'Online UPI',
      'Paid',
      'Shipped',
      'AP-TG Express Courier',
      'APTG-7782014-HYD',
      'https://tracking.aptgexpress.in/track/APTG-7782014-HYD',
      JSON.stringify(sampleTimeline),
      '2026-10-01T04:00:00.000Z',
      '2026-10-02T03:00:00.000Z'
    );
  }

  // 7. Seed Reviews
  const reviewCount = db.prepare('SELECT COUNT(*) as count FROM reviews').get().count;
  if (reviewCount === 0) {
    const insertReview = db.prepare(`
      INSERT INTO reviews (id, product_id, author, location, rating, title, content, verified, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertReview.run(
      'rev_1',
      'bioenzyme-concentrate',
      'Dr. Ramana Murthy',
      'Gachibowli, Hyderabad',
      5,
      'Remarkable for kitchen grease and zero chemical smell',
      'We switched to Prakriti Bioenzyme for our kitchen chimney and cooktop grease. It takes about 2-3 minutes of contact time to dissolve grease, and the subtle citrus scent is completely natural. No coughing or stinging eyes like with commercial degreasers.',
      1,
      'approved',
      '2026-09-14T10:00:00.000Z'
    );

    insertReview.run(
      'rev_2',
      'bioenzyme-concentrate',
      'Pavani K.',
      'Benz Circle, Vijayawada',
      5,
      'Cleared bathroom drain odors permanently',
      'Pouring 100ml directly down the shower drain before sleeping eliminated the musty biofilm smell in two days. Truly grateful for an authentic local product that does not use chlorine.',
      1,
      'approved',
      '2026-09-02T11:30:00.000Z'
    );

    insertReview.run(
      'rev_3',
      'dishwash-liquid',
      'Sowmya Reddy',
      'Kukatpally, Hyderabad',
      5,
      'My hands stopped peeling!',
      'Synthetic dishwash bars always gave me dermatitis. This soapnut and citrus formula is remarkably soft on hands and cleans oily stainless steel pressure cookers effortlessly.',
      1,
      'approved',
      '2026-08-28T09:15:00.000Z'
    );

    insertReview.run(
      'rev_4',
      'floor-cleaner',
      'Vikram Varma',
      'Madhapur, Hyderabad',
      5,
      'Safe for our golden retriever who licks the floor',
      'With pets at home, ordinary phenyls and pine cleaners were always a concern. This citrus floor cleaner dries clean without leaving any chemical residue or slick film.',
      1,
      'approved',
      '2026-08-18T14:20:00.000Z'
    );

    insertReview.run(
      'rev_5',
      'laundry-detergent',
      'Haritha N.',
      'Visakhapatnam',
      5,
      'Leaves cottons soft without toxic fabric softeners',
      'Excellent performance in our front load washing machine. Removes sweat stains easily and clothes come out smelling like fresh air and subtle lavender.',
      1,
      'approved',
      '2026-08-10T08:00:00.000Z'
    );
  }

  // 8. Seed Enquiries
  const enquiryCount = db.prepare('SELECT COUNT(*) as count FROM enquiries').get().count;
  if (enquiryCount === 0) {
    const insertEnq = db.prepare(`
      INSERT INTO enquiries (id, name, email, phone, organization, location, type, estimated_liters, application, message, status, assigned_admin, internal_notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertEnq.run(
      'enq_1',
      'Rajesh Sharma',
      'rajesh@rainbowvistas.org',
      '+91 98490 11223',
      'Rainbow Vistas Gated Community',
      'Hyderabad, Telangana',
      'b2b_bulk',
      '100-250',
      'floor',
      'Interested in transitioning our residential tower clubhouse and lobby mopping to citrus bioenzymes.',
      'New',
      'Operations Manager',
      'Follow up on bulk 50L can delivery rates and dispenser requirements.',
      now,
      now
    );

    insertEnq.run(
      'enq_2',
      'Meena Kumari',
      'meena.k@gmail.com',
      '+91 98481 99887',
      '',
      'Vijayawada, AP',
      'contact',
      '',
      '',
      'Can the bioenzyme concentrate be used safely on polished teak wood furniture?',
      'Contacted',
      'Super Administrator',
      'Advised 1:50 dilution with soft microfiber cloth.',
      now,
      now
    );
  }
}

// Run schema and seed
initSchema();
seedData();

module.exports = {
  db,
  hashPassword,
  verifyPassword
};
