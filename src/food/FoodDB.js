// Offline food search engine
// Queries USDA + NIN + saved/scanned foods from IndexedDB
// No API calls — fully local, instant results

import { db } from '../db/db.js'
import usdaFoodsData from '../data/usda_foods.json'
import ninFoodsData  from '../data/nin_foods.json'
import { localDate } from '../log/DayLog.jsx'
import { generateId } from '../auth/crypto.js'

// ─── Seed bundled foods into IndexedDB ───────────────────────────────────────
// Data is bundled as static imports — no fetch needed, works offline from
// the very first load with no service worker dependency.

// Common staples missing from the initial USDA/NIN dataset
const STAPLE_FOODS = [
  { id:'staples_001', name:'Sugar, white',         per100g:{ calories:387, protein:0,   carbs:100,  fat:0,    fibre:0   }, servingSize:5,   servingLabel:'1 tsp'    },
  { id:'staples_002', name:'Sugar, brown',          per100g:{ calories:380, protein:0,   carbs:98,   fat:0,    fibre:0   }, servingSize:5,   servingLabel:'1 tsp'    },
  { id:'staples_003', name:'Honey',                 per100g:{ calories:304, protein:0.3, carbs:82,   fat:0,    fibre:0.2 }, servingSize:21,  servingLabel:'1 tbsp'   },
  { id:'staples_004', name:'Coconut Sugar',         per100g:{ calories:375, protein:0,   carbs:94,   fat:0,    fibre:0   }, servingSize:5,   servingLabel:'1 tsp'    },
  { id:'staples_005', name:'Maple Syrup',           per100g:{ calories:260, protein:0,   carbs:67,   fat:0,    fibre:0   }, servingSize:20,  servingLabel:'1 tbsp'   },
  { id:'staples_006', name:'Condensed Milk, sweet', per100g:{ calories:321, protein:7.9, carbs:54,   fat:8.7,  fibre:0   }, servingSize:30,  servingLabel:'2 tbsp'   },
  { id:'staples_007', name:'Coconut Milk',          per100g:{ calories:197, protein:2.3, carbs:2.8,  fat:21,   fibre:0.5 }, servingSize:30,  servingLabel:'2 tbsp'   },
  { id:'staples_008', name:'Coconut Cream',         per100g:{ calories:330, protein:3.6, carbs:6.7,  fat:34,   fibre:0   }, servingSize:30,  servingLabel:'2 tbsp'   },
  { id:'staples_009', name:'Olive Oil',             per100g:{ calories:884, protein:0,   carbs:0,    fat:100,  fibre:0   }, servingSize:14,  servingLabel:'1 tbsp'   },
  { id:'staples_010', name:'Coconut Oil',           per100g:{ calories:892, protein:0,   carbs:0,    fat:99,   fibre:0   }, servingSize:14,  servingLabel:'1 tbsp'   },
  { id:'staples_011', name:'Salt',                  per100g:{ calories:0,   protein:0,   carbs:0,    fat:0,    fibre:0   }, servingSize:6,   servingLabel:'1 tsp'    },
  { id:'staples_012', name:'Baking Powder',         per100g:{ calories:53,  protein:0,   carbs:28,   fat:0,    fibre:0   }, servingSize:4,   servingLabel:'1 tsp'    },
  { id:'staples_013', name:'Corn Starch',           per100g:{ calories:381, protein:0.3, carbs:91,   fat:0.1,  fibre:0.9 }, servingSize:8,   servingLabel:'1 tbsp'   },
  { id:'staples_014', name:'Mishri / Rock Sugar',   per100g:{ calories:398, protein:0,   carbs:100,  fat:0,    fibre:0   }, servingSize:10,  servingLabel:'2 pieces' },
  { id:'staples_015', name:'Dates, dried',          per100g:{ calories:282, protein:2.5, carbs:75,   fat:0.4,  fibre:8   }, servingSize:24,  servingLabel:'2 dates'  },
  { id:'staples_016', name:'Vanilla Extract',       per100g:{ calories:288, protein:0.1, carbs:13,   fat:0.1,  fibre:0   }, servingSize:4,   servingLabel:'1 tsp'    },
  { id:'staples_017', name:'Cocoa Powder, unsweetened',per100g:{ calories:228, protein:19.6,carbs:57, fat:13.7, fibre:37  }, servingSize:8,   servingLabel:'1 tbsp'   },
  { id:'staples_018', name:'Milk Powder, full fat', per100g:{ calories:496, protein:26,  carbs:38,   fat:27,   fibre:0   }, servingSize:30,  servingLabel:'3 tbsp'   },
  { id:'staples_019', name:'Chia Seeds',            per100g:{ calories:486, protein:17,  carbs:42,   fat:31,   fibre:34  }, servingSize:12,  servingLabel:'1 tbsp'   },
  { id:'staples_020', name:'Flax Seeds',            per100g:{ calories:534, protein:18,  carbs:29,   fat:42,   fibre:27  }, servingSize:10,  servingLabel:'1 tbsp'   },
  // V2 additions
  { id:'staples_021', name:'Blueberries',           per100g:{ calories:57,  protein:0.7, carbs:14.5, fat:0.3,  fibre:2.4 }, servingSize:100, servingLabel:'handful'  },
  { id:'staples_022', name:'Raspberries',           per100g:{ calories:52,  protein:1.2, carbs:11.9, fat:0.7,  fibre:6.5 }, servingSize:100, servingLabel:'handful'  },
  { id:'staples_023', name:'Ginger, fresh',         per100g:{ calories:80,  protein:1.8, carbs:18,   fat:0.8,  fibre:2   }, servingSize:5,   servingLabel:'1 tsp grated' },
  { id:'staples_024', name:'Lettuce, romaine',      per100g:{ calories:17,  protein:1.2, carbs:3.3,  fat:0.3,  fibre:2.1 }, servingSize:85,  servingLabel:'1 cup'    },
  { id:'staples_025', name:'Cumin / Jeera',         per100g:{ calories:375, protein:18,  carbs:44,   fat:22,   fibre:10  }, servingSize:2,   servingLabel:'1 tsp'    },
  { id:'staples_026', name:'Cinnamon, ground',      per100g:{ calories:247, protein:4,   carbs:81,   fat:1.2,  fibre:53  }, servingSize:2.6, servingLabel:'1 tsp'    },
  { id:'staples_027', name:'Cardamom / Elaichi',    per100g:{ calories:311, protein:10.8,carbs:68,   fat:6.7,  fibre:28  }, servingSize:2,   servingLabel:'1 tsp'    },
  { id:'staples_028', name:'Rice Noodles, dry',     per100g:{ calories:364, protein:6,   carbs:80,   fat:0.6,  fibre:1.8 }, servingSize:80,  servingLabel:'1 serving' },
  { id:'staples_029', name:'Egg Noodles, cooked',   per100g:{ calories:138, protein:4.5, carbs:25,   fat:2.1,  fibre:1.8 }, servingSize:180, servingLabel:'1 bowl'   },
  { id:'staples_030', name:'Rava / Idli Rava',      per100g:{ calories:360, protein:12.7,carbs:73,   fat:1.1,  fibre:3.9 }, servingSize:40,  servingLabel:'1 serving' },
  { id:'staples_031', name:'Lettuce, iceberg',      per100g:{ calories:14,  protein:0.9, carbs:3,    fat:0.1,  fibre:1.2 }, servingSize:85,  servingLabel:'1 cup'    },
  { id:'staples_032', name:'Mango, fresh',          per100g:{ calories:60,  protein:0.8, carbs:15,   fat:0.4,  fibre:1.6 }, servingSize:150, servingLabel:'1 medium' },
  { id:'staples_033', name:'Watermelon',            per100g:{ calories:30,  protein:0.6, carbs:7.6,  fat:0.2,  fibre:0.4 }, servingSize:280, servingLabel:'2 cups'   },
  { id:'staples_034', name:'Lemon juice',           per100g:{ calories:22,  protein:0.4, carbs:6.9,  fat:0.2,  fibre:0.3 }, servingSize:15,  servingLabel:'1 tbsp'   },
  // V3 additions — desi grains, sandwiches, breakfast staples
  // ── Dalia / Broken Wheat ──
  { id:'staples_035', name:'Dalia / Broken Wheat, raw',            per100g:{ calories:346, protein:11.5, carbs:71,  fat:1.7,  fibre:9   }, servingSize:40,  servingLabel:'dry portion' },
  { id:'staples_036', name:'Dalia / Wheat Porridge, cooked (water)',per100g:{ calories:83,  protein:2.8,  carbs:17,  fat:0.4,  fibre:2.2 }, servingSize:200, servingLabel:'1 bowl'   },
  { id:'staples_037', name:'Dalia, cooked with milk',              per100g:{ calories:112, protein:4.5,  carbs:18,  fat:2.6,  fibre:1.8 }, servingSize:250, servingLabel:'1 bowl'   },
  { id:'staples_038', name:'Dalia Khichdi (savory, cooked)',       per100g:{ calories:100, protein:3.5,  carbs:18,  fat:2,    fibre:2   }, servingSize:200, servingLabel:'1 bowl'   },
  // ── Ragi / Finger Millet dishes ──
  { id:'staples_039', name:'Ragi Roti',                            per100g:{ calories:222, protein:7.3,  carbs:43,  fat:1.5,  fibre:5   }, servingSize:50,  servingLabel:'1 roti'   },
  { id:'staples_040', name:'Ragi Dosa',                            per100g:{ calories:135, protein:4,    carbs:25,  fat:2.5,  fibre:2   }, servingSize:70,  servingLabel:'1 dosa'   },
  { id:'staples_041', name:'Ragi Porridge / Kanji, cooked',        per100g:{ calories:75,  protein:2,    carbs:16,  fat:0.5,  fibre:1.5 }, servingSize:200, servingLabel:'1 bowl'   },
  { id:'staples_042', name:'Ragi Mudde (cooked balls)',            per100g:{ calories:170, protein:4,    carbs:36,  fat:0.5,  fibre:3.5 }, servingSize:100, servingLabel:'2 mudde'  },
  { id:'staples_043', name:'Ragi Ladoo',                           per100g:{ calories:432, protein:8,    carbs:67,  fat:16,   fibre:5   }, servingSize:30,  servingLabel:'1 ladoo'  },
  // ── Other grains ──
  { id:'staples_044', name:'Sattu (roasted chana flour)',          per100g:{ calories:413, protein:22.4, carbs:64,  fat:5.7,  fibre:7   }, servingSize:30,  servingLabel:'2 tbsp'   },
  { id:'staples_045', name:'Muesli, dry',                          per100g:{ calories:363, protein:9.5,  carbs:65,  fat:6.5,  fibre:8   }, servingSize:50,  servingLabel:'½ cup'    },
  { id:'staples_046', name:'Granola, plain',                       per100g:{ calories:388, protein:9.5,  carbs:63,  fat:12,   fibre:5   }, servingSize:50,  servingLabel:'½ cup'    },
  { id:'staples_047', name:'Oatmeal, cooked (plain, no sugar)',    per100g:{ calories:71,  protein:2.5,  carbs:12,  fat:1.5,  fibre:1.7 }, servingSize:250, servingLabel:'1 bowl'   },
  { id:'staples_048', name:'Overnight Oats (oats + milk)',         per100g:{ calories:118, protein:5.2,  carbs:18,  fat:2.8,  fibre:2   }, servingSize:250, servingLabel:'1 jar'    },
  // ── Sandwiches ──
  { id:'staples_049', name:'Sandwich, veg (brown bread)',          per100g:{ calories:177, protein:6,    carbs:29,  fat:4,    fibre:3   }, servingSize:150, servingLabel:'1 sandwich' },
  { id:'staples_050', name:'Sandwich, paneer',                     per100g:{ calories:183, protein:9.4,  carbs:21,  fat:6,    fibre:2   }, servingSize:180, servingLabel:'1 sandwich' },
  { id:'staples_051', name:'Sandwich, egg',                        per100g:{ calories:206, protein:8.8,  carbs:24,  fat:7.5,  fibre:2.5 }, servingSize:160, servingLabel:'1 sandwich' },
  { id:'staples_052', name:'Sandwich, chicken',                    per100g:{ calories:197, protein:12,   carbs:21,  fat:6.5,  fibre:2   }, servingSize:180, servingLabel:'1 sandwich' },
  { id:'staples_053', name:'Grilled Sandwich, veg cheese',         per100g:{ calories:245, protein:8,    carbs:30,  fat:10,   fibre:2.5 }, servingSize:160, servingLabel:'1 sandwich' },
  { id:'staples_054', name:'Grilled Sandwich, chicken cheese',     per100g:{ calories:228, protein:14,   carbs:22,  fat:9,    fibre:2   }, servingSize:190, servingLabel:'1 sandwich' },
  { id:'staples_055', name:'Toast, plain (white bread, 1 slice)',  per100g:{ calories:313, protein:10,   carbs:62,  fat:3.5,  fibre:3   }, servingSize:28,  servingLabel:'1 slice'  },
  { id:'staples_056', name:'Toast, brown bread (1 slice)',         per100g:{ calories:259, protein:9,    carbs:48,  fat:3,    fibre:5   }, servingSize:32,  servingLabel:'1 slice'  },
  // ── Desi snacks & dishes ──
  { id:'staples_057', name:'Besan Chilla, plain (cooked)',         per100g:{ calories:185, protein:9.5,  carbs:22,  fat:6.5,  fibre:4   }, servingSize:70,  servingLabel:'1 chilla' },
  { id:'staples_058', name:'Moong Dal Chilla (cooked)',            per100g:{ calories:162, protein:10,   carbs:20,  fat:4.5,  fibre:3.5 }, servingSize:70,  servingLabel:'1 chilla' },
  { id:'staples_059', name:'Sabudana Khichdi',                     per100g:{ calories:192, protein:2.5,  carbs:38,  fat:4,    fibre:1.2 }, servingSize:150, servingLabel:'1 serving' },
  { id:'staples_060', name:'Mixed Millet Roti (multi-millet)',     per100g:{ calories:218, protein:7,    carbs:42,  fat:2,    fibre:5   }, servingSize:50,  servingLabel:'1 roti'   },
  // ── Fruits & beverages ──
  { id:'staples_061', name:'Avocado',                              per100g:{ calories:160, protein:2,    carbs:9,   fat:15,   fibre:7   }, servingSize:75,  servingLabel:'½ avocado' },
  { id:'staples_062', name:'Green Tea, brewed',                    per100g:{ calories:1,   protein:0,    carbs:0.2, fat:0,    fibre:0   }, servingSize:240, servingLabel:'1 cup'    },
  { id:'staples_063', name:'Black Coffee (no milk/sugar)',         per100g:{ calories:2,   protein:0.3,  carbs:0,   fat:0,    fibre:0   }, servingSize:240, servingLabel:'1 cup'    },
  { id:'staples_064', name:'Coconut Water, fresh',                 per100g:{ calories:19,  protein:0.7,  carbs:3.7, fat:0.2,  fibre:1   }, servingSize:240, servingLabel:'1 glass'  },
  { id:'staples_065', name:'Pomegranate / Anar',                   per100g:{ calories:83,  protein:1.7,  carbs:19,   fat:1.2,  fibre:4   }, servingSize:100, servingLabel:'½ fruit'         },

  // ── V4: Indian street food & restaurant dishes ──
  { id:'staples_066', name:'Vada Pav',                             per100g:{ calories:167, protein:3.9,  carbs:23.3, fat:6.1,  fibre:1.7 }, servingSize:175, servingLabel:'1 piece'         },
  { id:'staples_067', name:'Pav Bhaji (2 pav)',                    per100g:{ calories:157, protein:3.4,  carbs:21.4, fat:6.3,  fibre:2.3 }, servingSize:350, servingLabel:'1 plate'         },
  { id:'staples_068', name:'Samosa, aloo',                         per100g:{ calories:262, protein:4,    carbs:30,   fat:13,   fibre:2   }, servingSize:100, servingLabel:'1 piece'         },
  { id:'staples_069', name:'Aloo Paratha, with ghee',              per100g:{ calories:250, protein:5.8,  carbs:33.3, fat:10.8, fibre:2.1 }, servingSize:120, servingLabel:'1 paratha'       },
  { id:'staples_070', name:'Chole Bhature (2 bhature)',            per100g:{ calories:167, protein:4,    carbs:20,   fat:7.3,  fibre:2.2 }, servingSize:450, servingLabel:'1 plate'         },
  { id:'staples_071', name:'Naan, plain',                          per100g:{ calories:300, protein:8.9,  carbs:51,   fat:7.8,  fibre:2.2 }, servingSize:90,  servingLabel:'1 naan'          },
  { id:'staples_072', name:'Naan, butter',                         per100g:{ calories:316, protein:8.4,  carbs:48.4, fat:10.5, fibre:2.1 }, servingSize:95,  servingLabel:'1 butter naan'   },
  { id:'staples_073', name:'Naan, garlic butter',                  per100g:{ calories:320, protein:8,    carbs:48,   fat:11.5, fibre:2   }, servingSize:100, servingLabel:'1 garlic naan'   },
  { id:'staples_074', name:'Butter Chicken, restaurant',           per100g:{ calories:150, protein:10,   carbs:7.1,  fat:10,   fibre:0.7 }, servingSize:280, servingLabel:'1 bowl'          },
  { id:'staples_075', name:'Dal Makhani, restaurant',              per100g:{ calories:143, protein:5,    carbs:14.3, fat:7.9,  fibre:2.9 }, servingSize:280, servingLabel:'1 bowl'          },
  { id:'staples_076', name:'Paneer Butter Masala, restaurant',     per100g:{ calories:161, protein:6.4,  carbs:7.1,  fat:12.5, fibre:1.1 }, servingSize:280, servingLabel:'1 bowl'          },
  { id:'staples_077', name:'Chicken Biryani, restaurant',          per100g:{ calories:144, protein:7.8,  carbs:17.8, fat:4.9,  fibre:0.7 }, servingSize:450, servingLabel:'1 plate'         },
  { id:'staples_078', name:'Veg Biryani, restaurant',              per100g:{ calories:125, protein:2.5,  carbs:21.3, fat:3.5,  fibre:1   }, servingSize:400, servingLabel:'1 plate'         },
  { id:'staples_079', name:'Masala Dosa, restaurant (large)',      per100g:{ calories:132, protein:2.8,  carbs:20,   fat:4.4,  fibre:1.2 }, servingSize:250, servingLabel:'1 dosa'          },
  { id:'staples_080', name:'Misal Pav (2 pav)',                    per100g:{ calories:137, protein:4,    carbs:18.6, fat:5.1,  fibre:2.9 }, servingSize:350, servingLabel:'1 plate'         },
  { id:'staples_081', name:'Kachori, aloo',                        per100g:{ calories:250, protein:4.2,  carbs:29.2, fat:12.5, fibre:1.7 }, servingSize:120, servingLabel:'1 piece'         },
  { id:'staples_082', name:'Pani Puri / Golgappa',                 per100g:{ calories:167, protein:3.3,  carbs:29.2, fat:4.2,  fibre:1.7 }, servingSize:120, servingLabel:'1 plate (6 pcs)' },
  { id:'staples_083', name:'Dahi Puri',                            per100g:{ calories:156, protein:4.4,  carbs:23.8, fat:4.4,  fibre:1.3 }, servingSize:160, servingLabel:'1 plate (6 pcs)' },
  { id:'staples_084', name:'Bhel Puri',                            per100g:{ calories:167, protein:3.3,  carbs:26.7, fat:5.3,  fibre:2   }, servingSize:150, servingLabel:'1 plate'         },
  { id:'staples_085', name:'Dabeli',                               per100g:{ calories:220, protein:5,    carbs:32,   fat:8,    fibre:2   }, servingSize:100, servingLabel:'1 piece'         },
  { id:'staples_086', name:'Dhokla, steamed',                      per100g:{ calories:175, protein:7,    carbs:28,   fat:3.5,  fibre:2   }, servingSize:100, servingLabel:'2-3 pieces'      },
  { id:'staples_087', name:'Poha, cooked',                         per100g:{ calories:125, protein:2.5,  carbs:22,   fat:3,    fibre:1   }, servingSize:200, servingLabel:'1 bowl'          },
  { id:'staples_088', name:'Upma, cooked',                         per100g:{ calories:140, protein:3,    carbs:21,   fat:4.5,  fibre:1.5 }, servingSize:200, servingLabel:'1 bowl'          },
  { id:'staples_089', name:'Gulab Jamun',                          per100g:{ calories:350, protein:5,    carbs:52.5, fat:13.8, fibre:0.6 }, servingSize:80,  servingLabel:'2 pieces'        },
  { id:'staples_090', name:'Mango Lassi',                          per100g:{ calories:80,  protein:2.3,  carbs:14,   fat:1.7,  fibre:0.3 }, servingSize:300, servingLabel:'1 glass'         },
  { id:'staples_091', name:'Masala Chai (milk & sugar)',           per100g:{ calories:40,  protein:1.8,  carbs:6,    fat:1,    fibre:0   }, servingSize:200, servingLabel:'1 cup'           },
  { id:'staples_092', name:'Butter Roti (with salted butter)',     per100g:{ calories:350, protein:9,    carbs:50,   fat:13,   fibre:3   }, servingSize:50,  servingLabel:'1 roti'          },
  { id:'staples_093', name:'Rajma, restaurant style',              per100g:{ calories:125, protein:5.7,  carbs:18.6, fat:3.2,  fibre:3.6 }, servingSize:280, servingLabel:'1 bowl'          },
  { id:'staples_094', name:'Palak Paneer, restaurant',             per100g:{ calories:131, protein:6.4,  carbs:6.1,  fat:9.6,  fibre:2.1 }, servingSize:280, servingLabel:'1 bowl'          },
  { id:'staples_095', name:'Dosa, plain (restaurant)',             per100g:{ calories:168, protein:3.9,  carbs:26.5, fat:5.2,  fibre:1   }, servingSize:120, servingLabel:'1 dosa'          },

  // ── V4: US restaurant chains ──
  { id:'staples_096', name:'Sweetgreen Harvest Bowl (chicken)',    per100g:{ calories:121, protein:8,    carbs:13.7, fat:3.7,  fibre:1.9 }, servingSize:700, servingLabel:'1 bowl'          },
  { id:'staples_097', name:'Sweetgreen Chicken Caesar Bowl',       per100g:{ calories:116, protein:8.5,  carbs:5.1,  fat:6.9,  fibre:1.6 }, servingSize:550, servingLabel:'1 bowl'          },
  { id:'staples_098', name:'Sweetgreen Super Green Goddess',       per100g:{ calories:103, protein:7.5,  carbs:7.2,  fat:5,    fibre:2.4 }, servingSize:520, servingLabel:'1 bowl'          },
  { id:'staples_099', name:'Chipotle Chicken Bowl (rice+beans+cheese+salsa)', per100g:{ calories:138, protein:7.8, carbs:14.5, fat:4.9, fibre:2.5 }, servingSize:550, servingLabel:'1 bowl' },
  { id:'staples_100', name:'Chipotle Chicken Burrito (standard)',  per100g:{ calories:168, protein:9.7,  carbs:17.2, fat:6.1,  fibre:2.7 }, servingSize:520, servingLabel:'1 burrito'       },
  { id:'staples_101', name:"McDonald's Big Mac",                   per100g:{ calories:277, protein:11.7, carbs:21.6, fat:16,   fibre:1.4 }, servingSize:213, servingLabel:'1 burger'        },
  { id:'staples_102', name:"McDonald's Quarter Pounder w/ Cheese", per100g:{ calories:258, protein:14.1, carbs:19.4, fat:13.5, fibre:1.2 }, servingSize:278, servingLabel:'1 burger'        },
  { id:'staples_103', name:'Subway Turkey 6-inch (wheat)',         per100g:{ calories:172, protein:12.2, carbs:26.5, fat:2.7,  fibre:2.7 }, servingSize:246, servingLabel:'1 sub'           },
  { id:'staples_104', name:'Starbucks Latte, Grande (whole milk)', per100g:{ calories:42,  protein:2.9,  carbs:4.2,  fat:1.6,  fibre:0   }, servingSize:454, servingLabel:'1 grande (16oz)' },
  { id:'staples_105', name:'Starbucks Caramel Frappuccino, Grande',per100g:{ calories:92,  protein:1.1,  carbs:14.5, fat:3.3,  fibre:0   }, servingSize:454, servingLabel:'1 grande (16oz)' },
  { id:'staples_106', name:"Chick-fil-A Spicy Deluxe Sandwich",   per100g:{ calories:240, protein:14.4, carbs:26.4, fat:8,    fibre:1.6 }, servingSize:228, servingLabel:'1 sandwich'       },
  { id:'staples_107', name:'Shake Shack ShackBurger',              per100g:{ calories:283, protein:16.3, carbs:22.5, fat:13.9, fibre:0.8 }, servingSize:245, servingLabel:'1 burger'        },
  { id:'staples_108', name:'Panera Half Salad + Half Soup (avg)',  per100g:{ calories:85,  protein:4.5,  carbs:9.5,  fat:3,    fibre:2   }, servingSize:480, servingLabel:'You Pick Two'    },

  // ── V5: Alcohol — calories correct; macros don't sum (ethanol = 7 cal/g) ──
  { id:'staples_109', name:'Beer, regular lager (5% ABV)',         per100g:{ calories:43,  protein:0.5,  carbs:3.6,  fat:0,    fibre:0   }, servingSize:330, servingLabel:'1 bottle/can (330ml)'  },
  { id:'staples_110', name:'Beer, light (4.2% ABV)',               per100g:{ calories:29,  protein:0.3,  carbs:1.6,  fat:0,    fibre:0   }, servingSize:330, servingLabel:'1 can (330ml)'          },
  { id:'staples_111', name:'Beer, craft / IPA (6.5% ABV)',         per100g:{ calories:58,  protein:0.6,  carbs:5,    fat:0,    fibre:0   }, servingSize:330, servingLabel:'1 can (330ml)'          },
  { id:'staples_112', name:'Kingfisher Strong (8% ABV)',           per100g:{ calories:63,  protein:0.5,  carbs:4.4,  fat:0,    fibre:0   }, servingSize:650, servingLabel:'1 bottle (650ml)'       },
  { id:'staples_113', name:'Whiskey / Scotch (40% ABV)',           per100g:{ calories:231, protein:0,    carbs:0.1,  fat:0,    fibre:0   }, servingSize:45,  servingLabel:'1.5 oz shot'             },
  { id:'staples_114', name:'Vodka (40% ABV)',                      per100g:{ calories:231, protein:0,    carbs:0,    fat:0,    fibre:0   }, servingSize:45,  servingLabel:'1.5 oz shot'             },
  { id:'staples_115', name:'Rum, dark (40% ABV)',                  per100g:{ calories:231, protein:0,    carbs:0.1,  fat:0,    fibre:0   }, servingSize:45,  servingLabel:'1.5 oz shot'             },
  { id:'staples_116', name:'Gin (40% ABV)',                        per100g:{ calories:263, protein:0,    carbs:0,    fat:0,    fibre:0   }, servingSize:45,  servingLabel:'1.5 oz shot'             },
  { id:'staples_117', name:'Red Wine (13% ABV)',                   per100g:{ calories:85,  protein:0.1,  carbs:2.6,  fat:0,    fibre:0   }, servingSize:150, servingLabel:'1 glass (5oz)'          },
  { id:'staples_118', name:'White Wine / Rosé (12% ABV)',          per100g:{ calories:82,  protein:0.1,  carbs:2.6,  fat:0,    fibre:0   }, servingSize:150, servingLabel:'1 glass (5oz)'          },
  { id:'staples_119', name:'Champagne / Prosecco (12% ABV)',       per100g:{ calories:80,  protein:0.3,  carbs:2.8,  fat:0,    fibre:0   }, servingSize:150, servingLabel:'1 flute (5oz)'          },
  { id:'staples_120', name:'Mojito',                               per100g:{ calories:85,  protein:0,    carbs:8.5,  fat:0,    fibre:0   }, servingSize:200, servingLabel:'1 cocktail'             },
  { id:'staples_121', name:'Gin & Tonic',                          per100g:{ calories:88,  protein:0,    carbs:9,    fat:0,    fibre:0   }, servingSize:200, servingLabel:'1 drink'                },
  { id:'staples_122', name:'Margarita (standard)',                  per100g:{ calories:133, protein:0.2,  carbs:11.5, fat:0,    fibre:0   }, servingSize:180, servingLabel:'1 cocktail'             },
  { id:'staples_123', name:'Long Island Iced Tea',                  per100g:{ calories:142, protein:0,    carbs:12,   fat:0,    fibre:0   }, servingSize:200, servingLabel:'1 cocktail'             },
  { id:'staples_124', name:'Whiskey Soda / Highball',              per100g:{ calories:60,  protein:0,    carbs:2,    fat:0,    fibre:0   }, servingSize:240, servingLabel:'1 highball (8oz)'       },

  // ── V5: Pizza ──
  { id:'staples_125', name:'Pizza, cheese (takeout slice)',         per100g:{ calories:266, protein:11.2, carbs:33.6, fat:9.3,  fibre:2   }, servingSize:107, servingLabel:'1 slice (1/8 of 12")'  },
  { id:'staples_126', name:'Pizza, pepperoni (takeout slice)',      per100g:{ calories:284, protein:12,   carbs:30.7, fat:12.4, fibre:1.9 }, servingSize:113, servingLabel:'1 slice (1/8 of 12")'  },
  { id:'staples_127', name:'Pizza, margherita (restaurant 2 slices)', per100g:{ calories:258, protein:11, carbs:32,   fat:9,    fibre:2   }, servingSize:220, servingLabel:'2 slices'              },

  // ── V5: Chinese / Thai takeout ──
  { id:'staples_128', name:'Veg Fried Rice, restaurant',           per100g:{ calories:140, protein:2.7,  carbs:24,   fat:3.7,  fibre:1   }, servingSize:300, servingLabel:'1 serving'             },
  { id:'staples_129', name:'Chicken Fried Rice, restaurant',       per100g:{ calories:155, protein:6.2,  carbs:22,   fat:4.7,  fibre:0.8 }, servingSize:300, servingLabel:'1 serving'             },
  { id:'staples_130', name:'Hakka Noodles, restaurant',            per100g:{ calories:127, protein:3,    carbs:20,   fat:3.7,  fibre:1.2 }, servingSize:300, servingLabel:'1 serving'             },
  { id:'staples_131', name:'Spring Roll, fried',                   per100g:{ calories:180, protein:4,    carbs:20,   fat:9,    fibre:1.5 }, servingSize:100, servingLabel:'1 piece'               },
  { id:'staples_132', name:'Pad Thai, restaurant',                 per100g:{ calories:164, protein:6.9,  carbs:19.4, fat:6.3,  fibre:1   }, servingSize:350, servingLabel:'1 serving'             },
  { id:'staples_133', name:'Manchurian, veg (restaurant)',         per100g:{ calories:148, protein:3.5,  carbs:18,   fat:6.5,  fibre:1.8 }, servingSize:250, servingLabel:'1 serving'             },

  // ── V5: Soft drinks & juice ──
  { id:'staples_134', name:'Coca-Cola / Pepsi',                    per100g:{ calories:42,  protein:0,    carbs:10.6, fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can (355ml)'          },
  { id:'staples_135', name:'Fresh Lime Soda, sweetened',           per100g:{ calories:40,  protein:0.1,  carbs:10.5, fat:0,    fibre:0   }, servingSize:300, servingLabel:'1 glass'               },
  { id:'staples_136', name:'Orange Juice, fresh (1 glass)',        per100g:{ calories:45,  protein:0.7,  carbs:10.4, fat:0.2,  fibre:0.2 }, servingSize:240, servingLabel:'1 glass'               },
  { id:'staples_137', name:'Mango Juice / Slice / Maaza',          per100g:{ calories:60,  protein:0,    carbs:15,   fat:0,    fibre:0   }, servingSize:250, servingLabel:'1 bottle/pack'          },
  { id:'staples_138', name:'Red Bull Energy Drink',                per100g:{ calories:45,  protein:0.4,  carbs:11,   fat:0,    fibre:0   }, servingSize:250, servingLabel:'1 can (250ml)'          },

  // ── V5: Desserts & bakery ──
  { id:'staples_139', name:'Vanilla Ice Cream (scoop)',            per100g:{ calories:207, protein:3.5,  carbs:23.6, fat:11,   fibre:0   }, servingSize:100, servingLabel:'1 scoop'               },
  { id:'staples_140', name:'Chocolate Ice Cream (scoop)',          per100g:{ calories:216, protein:3.8,  carbs:26,   fat:11,   fibre:1   }, servingSize:100, servingLabel:'1 scoop'               },
  { id:'staples_141', name:'Donut, glazed',                        per100g:{ calories:452, protein:4.9,  carbs:51,   fat:25,   fibre:1   }, servingSize:57,  servingLabel:'1 donut'               },
  { id:'staples_142', name:'Croissant, plain',                     per100g:{ calories:406, protein:8.2,  carbs:45.8, fat:21,   fibre:2.5 }, servingSize:57,  servingLabel:'1 croissant'           },
  { id:'staples_143', name:'Brownie, chocolate (restaurant)',      per100g:{ calories:415, protein:5,    carbs:60,   fat:18,   fibre:2   }, servingSize:60,  servingLabel:'1 piece'               },
  { id:'staples_144', name:'Tiramisu (restaurant portion)',        per100g:{ calories:240, protein:4.5,  carbs:25,   fat:13,   fibre:0.5 }, servingSize:150, servingLabel:'1 portion'             },

  // ── V6: US beer by brand label (all per 12 oz / 355 ml serving) ──
  // Calories correct; macros don't fully sum — ethanol = 7 cal/g not tracked in fat/carbs/protein
  // Domestic lagers & lights
  { id:'staples_145', name:'Budweiser',                            per100g:{ calories:41,  protein:0.4,  carbs:3,    fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_146', name:'Bud Light',                            per100g:{ calories:31,  protein:0.3,  carbs:1.9,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_147', name:'Bud Light Lime',                       per100g:{ calories:33,  protein:0.2,  carbs:2.3,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_148', name:'Bud Light Next (zero carb)',           per100g:{ calories:23,  protein:0,    carbs:0,    fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_149', name:'Coors Light',                          per100g:{ calories:29,  protein:0.3,  carbs:1.4,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_150', name:'Coors Banquet',                        per100g:{ calories:42,  protein:0.4,  carbs:3.4,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_151', name:'Miller Lite',                          per100g:{ calories:27,  protein:0.3,  carbs:0.9,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_152', name:'Miller High Life',                     per100g:{ calories:40,  protein:0.3,  carbs:3.7,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_153', name:'Miller Genuine Draft (MGD)',           per100g:{ calories:40,  protein:0.3,  carbs:3.7,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_154', name:'Miller64',                             per100g:{ calories:18,  protein:0.2,  carbs:0.7,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_155', name:'Michelob Ultra',                       per100g:{ calories:27,  protein:0.2,  carbs:0.7,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_156', name:'Michelob Ultra Pure Gold',             per100g:{ calories:24,  protein:0.1,  carbs:0.7,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_157', name:'Michelob AmberBock',                   per100g:{ calories:47,  protein:0.4,  carbs:4.3,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_158', name:'Natural Light (Natty Light)',          per100g:{ calories:27,  protein:0.2,  carbs:0.9,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_159', name:'Busch Light',                          per100g:{ calories:27,  protein:0.2,  carbs:0.9,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_160', name:'Busch',                                per100g:{ calories:32,  protein:0.2,  carbs:1.9,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_161', name:'Pabst Blue Ribbon (PBR)',              per100g:{ calories:41,  protein:0.4,  carbs:3.6,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_162', name:'Keystone Light',                       per100g:{ calories:28,  protein:0.3,  carbs:1.4,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_163', name:'Yuengling Traditional Lager',          per100g:{ calories:38,  protein:0.3,  carbs:3.5,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_164', name:'Yuengling Light Lager',                per100g:{ calories:27,  protein:0.2,  carbs:1.8,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_165', name:'Rolling Rock',                         per100g:{ calories:34,  protein:0.3,  carbs:2.8,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_166', name:'Landshark Lager',                      per100g:{ calories:38,  protein:0.3,  carbs:3.2,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_167', name:'Shock Top Belgian White',              per100g:{ calories:46,  protein:0.5,  carbs:3.9,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  // Imports
  { id:'staples_168', name:'Heineken',                             per100g:{ calories:40,  protein:0.3,  carbs:3,    fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_169', name:'Heineken 0.0 (non-alcoholic)',         per100g:{ calories:19,  protein:0.3,  carbs:4.8,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_170', name:'Stella Artois',                        per100g:{ calories:42,  protein:0.5,  carbs:3.3,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_171', name:'Corona Extra',                         per100g:{ calories:42,  protein:0.3,  carbs:3.7,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_172', name:'Corona Light',                         per100g:{ calories:28,  protein:0.2,  carbs:1.4,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_173', name:'Corona Premier',                       per100g:{ calories:25,  protein:0.3,  carbs:0.7,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_174', name:'Modelo Especial',                      per100g:{ calories:40,  protein:0.3,  carbs:3.8,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_175', name:'Modelo Negra',                         per100g:{ calories:48,  protein:0.5,  carbs:4.2,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_176', name:'Dos Equis Lager Especial',             per100g:{ calories:37,  protein:0.3,  carbs:3.1,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_177', name:'Dos Equis Amber',                      per100g:{ calories:37,  protein:0.3,  carbs:2.5,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_178', name:'Tecate',                               per100g:{ calories:39,  protein:0.3,  carbs:3.1,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_179', name:'Pacifico',                             per100g:{ calories:40,  protein:0.3,  carbs:3.8,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_180', name:'Sol',                                  per100g:{ calories:37,  protein:0.3,  carbs:3.1,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_181', name:'Guinness Draught',                     per100g:{ calories:35,  protein:0.3,  carbs:2.8,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_182', name:'Guinness Extra Stout',                 per100g:{ calories:50,  protein:0.5,  carbs:4,    fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_183', name:'Guinness 0 (non-alcoholic)',           per100g:{ calories:20,  protein:0.3,  carbs:4.2,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_184', name:'Sam Adams Boston Lager',               per100g:{ calories:49,  protein:0.6,  carbs:5.1,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_185', name:'Sam Adams Light',                      per100g:{ calories:34,  protein:0.2,  carbs:2.7,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_186', name:'Blue Moon Belgian White',              per100g:{ calories:47,  protein:0.5,  carbs:3.8,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_187', name:'Blue Moon Light Sky',                  per100g:{ calories:27,  protein:0.3,  carbs:1.4,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  // Craft
  { id:'staples_188', name:'Sierra Nevada Pale Ale',               per100g:{ calories:49,  protein:0.6,  carbs:4,    fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_189', name:'Lagunitas IPA',                        per100g:{ calories:58,  protein:0.5,  carbs:5.1,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_190', name:'New Belgium Fat Tire',                 per100g:{ calories:45,  protein:0.5,  carbs:4.2,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_191', name:'Dogfish Head 60 Minute IPA',           per100g:{ calories:56,  protein:0.5,  carbs:3.9,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_192', name:'Dogfish Head 90 Minute IPA',           per100g:{ calories:84,  protein:0.6,  carbs:5.4,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_193', name:'Goose Island IPA',                     per100g:{ calories:55,  protein:0.5,  carbs:4.4,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_194', name:'Founders All Day IPA',                 per100g:{ calories:42,  protein:0.5,  carbs:4,    fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_195', name:'Stone IPA',                            per100g:{ calories:61,  protein:0.6,  carbs:4.2,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_196', name:'Brooklyn Lager',                       per100g:{ calories:48,  protein:0.5,  carbs:4.5,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_197', name:'Allagash White',                       per100g:{ calories:42,  protein:0.5,  carbs:3.1,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_198', name:"Oskar Blues Dale's Pale Ale",          per100g:{ calories:56,  protein:0.5,  carbs:3.7,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  // Hard seltzers & ciders
  { id:'staples_199', name:'White Claw Hard Seltzer',              per100g:{ calories:28,  protein:0,    carbs:0.6,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can (12oz)'        },
  { id:'staples_200', name:'Truly Hard Seltzer',                   per100g:{ calories:28,  protein:0,    carbs:0.3,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can (12oz)'        },
  { id:'staples_201', name:'Bud Light Seltzer',                    per100g:{ calories:28,  protein:0,    carbs:0.6,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can (12oz)'        },
  { id:'staples_202', name:'High Noon Hard Seltzer',               per100g:{ calories:28,  protein:0,    carbs:0.6,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can (12oz)'        },
  { id:'staples_203', name:'Angry Orchard Hard Cider',             per100g:{ calories:54,  protein:0,    carbs:6.8,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_204', name:'Strongbow Hard Cider',                 per100g:{ calories:46,  protein:0,    carbs:4.5,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 can/bottle (12oz)' },
  { id:'staples_205', name:"Mike's Hard Lemonade",                 per100g:{ calories:62,  protein:0,    carbs:9.6,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 bottle (12oz)'     },
  { id:'staples_206', name:'Smirnoff Ice',                         per100g:{ calories:64,  protein:0,    carbs:8.5,  fat:0,    fibre:0   }, servingSize:355, servingLabel:'1 bottle (12oz)'     },
]

let _seeded = false

export async function seedFoodDatabase() {
  if (_seeded) return true

  try {
    // If usda_001 already exists, data is seeded from a previous session
    const alreadySeeded = await db.foods.get('usda_001')
    if (alreadySeeded) {
      _seeded = true
      // Incremental staple patches — each sentinel is the first ID of that batch.
      // Filter uses >= so a user skipping versions still gets all newer entries.
      const STAPLE_VERSIONS = [
        { sentinel: 'staples_001', minId: 1   },
        { sentinel: 'staples_021', minId: 21  },
        { sentinel: 'staples_035', minId: 35  },
        { sentinel: 'staples_066', minId: 66  },
        { sentinel: 'staples_109', minId: 109 },
        { sentinel: 'staples_145', minId: 145 },
      ]
      for (const { sentinel, minId } of STAPLE_VERSIONS) {
        if (await db.foods.get(sentinel)) continue
        const batch = STAPLE_FOODS.filter(f => parseInt(f.id.split('_')[1]) >= minId)
        await db.foods.bulkPut(batch.map(f => ({ ...f, source: 'nin', tags: [] })))
      }

      // Fix foods whose source was corrupted to 'saved' by bulkPut from Supabase
      // (Supabase household_foods has no source column → defaults to 'saved')
      // A food with a non-empty ingredients array is always a recipe.
      const corrupted = await db.foods
        .where('source').anyOf(['saved', 'scanned'])
        .filter(f => Array.isArray(f.ingredients) && f.ingredients.length > 0)
        .toArray()
      if (corrupted.length) {
        await db.foods.bulkPut(corrupted.map(f => ({ ...f, source: 'recipe' })))
      }

      const hasNinV2 = await db.foods.get('nin_312')
      if (!hasNinV2) {
        const ninNew = ninFoodsData.filter(f => parseInt(f.id.split('_')[1]) >= 312)
        await db.foods.bulkPut(ninNew.map(f => ({ ...f, source: 'nin', tags: f.tags || [] })))
        // Remove duplicate NIN entries that were deduplicated in this release
        const dupeIds = ['nin_093','nin_094','nin_096','nin_097','nin_101','nin_102','nin_103',
          'nin_115','nin_117','nin_130','nin_136','nin_142','nin_143','nin_147','nin_157',
          'nin_171','nin_172','nin_185','nin_191','nin_211','nin_212']
        await db.foods.bulkDelete(dupeIds)
      }
      return true
    }

    // tags:[] required — omitting a multi-entry indexed field causes bulkPut
    // to fail silently on Safari iOS (IndexedDB multi-entry index constraint)
    const all = [
      ...usdaFoodsData.map(f => ({ ...f, source: 'usda', tags: f.tags || [] })),
      ...ninFoodsData.map(f  => ({ ...f, source: 'nin',  tags: f.tags || [] })),
      ...STAPLE_FOODS.map(f  => ({ ...f, source: 'nin',  tags: [] })),
    ]

    await db.foods.bulkPut(all)
    _seeded = true
    return true
  } catch (e) {
    console.warn('FoodDB seed error:', e)
    return false
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search foods by name — returns up to `limit` results.
 * Priority: saved/scanned first, then nin, then usda.
 * Matches anywhere in the name — not just prefix.
 */
export async function searchFoods(query, limit = 20) {
  if (!query || query.trim().length < 1) return []

  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)

  const all = await db.foods.toArray()

  // Every word must appear somewhere in the name (AND logic)
  const matches = all.filter(f => {
    const name = f.name.toLowerCase()
    return words.every(w => name.includes(w))
  })

  // Sort by priority then relevance
  matches.sort((a, b) => {
    const pa = sourcePriority(a.source)
    const pb = sourcePriority(b.source)
    if (pa !== pb) return pa - pb

    // Within same source — exact start match ranked higher
    const aName = a.name.toLowerCase()
    const bName = b.name.toLowerCase()
    const aStarts = aName.startsWith(words[0]) ? 0 : 1
    const bStarts = bName.startsWith(words[0]) ? 0 : 1
    return aStarts - bStarts
  })

  // De-duplicate: if user has saved/scanned a food with this exact name,
  // hide the DB (usda/nin) entry — the user's macros take precedence.
  const personalNames = new Set(
    matches
      .filter(f => f.source === 'saved' || f.source === 'scanned')
      .map(f => f.name.toLowerCase().trim())
  )

  const deduped = personalNames.size === 0
    ? matches
    : matches.filter(f =>
        f.source !== 'usda' && f.source !== 'nin'
          ? true
          : !personalNames.has(f.name.toLowerCase().trim())
      )

  return deduped.slice(0, limit)
}

function sourcePriority(source) {
  switch (source) {
    case 'recipe':  return 0
    case 'saved':   return 1
    case 'scanned': return 2
    case 'nin':     return 3
    case 'usda':    return 4
    default:        return 5
  }
}

// ─── Recent foods ─────────────────────────────────────────────────────────────

/**
 * Get foods logged by userId in the last 7 days,
 * sorted by frequency (most logged first).
 */
export async function getRecentFoods(userId, limit = 10) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const cutoff = localDate(sevenDaysAgo)
  const today  = localDate()

  const logs = await db.foodLogs
    .where('[userId+date]')
    .between([userId, cutoff], [userId, today], true, true)
    .toArray()

  // Count frequency per foodId and batchId separately
  const foodFreq  = {}
  const batchFreq = {}
  for (const log of logs) {
    if (log.foodId)  foodFreq[log.foodId]   = (foodFreq[log.foodId]   || 0) + 1
    if (log.batchId) batchFreq[log.batchId] = (batchFreq[log.batchId] || 0) + 1
  }

  // Fetch top foods and recent batches in parallel
  const topFoodIds = Object.entries(foodFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)

  const [foods, batches] = await Promise.all([
    Promise.all(topFoodIds.map(id => db.foods.get(id))),
    Object.keys(batchFreq).length
      ? db.batches.bulkGet(Object.keys(batchFreq))
      : Promise.resolve([]),
  ])

  // Tag batch items so MealEntry can call selectItem(null, batch) for them
  const recentBatches = batches
    .filter(Boolean)
    .map(b => ({ ...b, _isBatch: true }))

  return [...foods.filter(Boolean), ...recentBatches]
    .sort((a, b) => {
      const fa = a._isBatch ? (batchFreq[a.id] || 0) : (foodFreq[a.id] || 0)
      const fb = b._isBatch ? (batchFreq[b.id] || 0) : (foodFreq[b.id] || 0)
      return fb - fa
    })
    .slice(0, limit)
}

// ─── Get food by ID ───────────────────────────────────────────────────────────

export async function getFoodById(id) {
  return db.foods.get(id)
}

// ─── Get food by barcode ──────────────────────────────────────────────────────

export async function getFoodByBarcode(barcode) {
  if (!barcode) return null
  const results = await db.foods.where('barcode').equals(barcode).toArray()
  return results[0] || null
}

// ─── Save scanned / custom food ───────────────────────────────────────────────

export async function saveFood(food, householdId) {
  const entry = {
    tags:   [],
    ...food,
    id:     food.id || generateId(),
    source: food.source || 'saved',
    dirty:  1,
    updatedAt: new Date().toISOString(),
  }
  // Write to IndexedDB first — visible immediately, works offline
  await db.foods.put(entry)

  // Sync to Supabase in the background — failure is safe, dirty:1 means
  // the background sync or next flushDirtyToSupabase will retry
  if (householdId) {
    const { sbSaveFood } = await import('../db/db.js')
    sbSaveFood(entry, householdId)
      .then(() => db.foods.update(entry.id, { dirty: 0 }))
      .catch(e => console.warn('Food sync will retry on next flush:', e.message))
  }

  return entry
}

export async function deleteFood(id, householdId) {
  const food = await db.foods.get(id).catch(() => null)
  await db.foods.delete(id)

  // Track deleted IDs in localStorage so syncFromCloud never restores them
  try {
    const deleted = JSON.parse(localStorage.getItem('nourish_deleted_foods') || '[]')
    if (!deleted.includes(id)) {
      deleted.push(id)
      // Keep last 2000 entries to avoid unbounded growth
      localStorage.setItem('nourish_deleted_foods', JSON.stringify(deleted.slice(-2000)))
    }
  } catch {}

  // Recipes: only delete locally — other household members should keep access.
  // Non-recipe foods (labels, scanned): also remove from Supabase.
  if (householdId && food?.source !== 'recipe') {
    const { sbDeleteFood } = await import('../db/db.js')
    await sbDeleteFood(id).catch(e => console.warn('Supabase food delete error:', e))
  }
}

// Pull household foods from Supabase and merge into local DB
export async function fetchHouseholdFoods(householdId) {
  if (!householdId) return
  try {
    const { sbFetchHouseholdFoods } = await import('../db/db.js')
    const foods = await sbFetchHouseholdFoods(householdId)
    if (!foods.length) return
    // Never restore foods this user explicitly deleted
    let deletedIds = new Set()
    try { deletedIds = new Set(JSON.parse(localStorage.getItem('nourish_deleted_foods') || '[]')) } catch {}
    // Never clobber local records that have richer data than remote
    const localRecords = await db.foods.bulkGet(foods.map(f => f.id))
    const toSave = foods.filter((remote, i) => {
      if (deletedIds.has(remote.id)) return false
      const local = localRecords[i]
      if (!local) return true
      // Don't clobber local data that is newer or equal
      const localTs  = local.updatedAt || ''
      const remoteTs = remote.updatedAt || ''
      if (localTs && remoteTs && localTs >= remoteTs) return false
      const localHasIngredients  = Array.isArray(local.ingredients)  && local.ingredients.length  > 0
      const remoteHasIngredients = Array.isArray(remote.ingredients) && remote.ingredients.length > 0
      if (localHasIngredients && !remoteHasIngredients) return false
      return true
    })
    if (toSave.length) await db.foods.bulkPut(toSave)
  } catch (e) {
    console.warn('fetchHouseholdFoods error:', e)
  }
}

// Push all locally saved/scanned/recipe foods up to Supabase for household sharing
// Called at login to catch any foods created before Supabase table existed
export async function pushLocalFoodsToHousehold(householdId) {
  if (!householdId) return { pushed: 0, error: null }
  try {
    const personal = await db.foods
      .where('source').anyOf(['saved', 'scanned', 'recipe'])
      .toArray()
    if (!personal.length) return { pushed: 0, error: null }
    const { sbSaveFood } = await import('../db/db.js')
    let pushed = 0
    let lastError = null
    for (const food of personal) {
      try {
        await sbSaveFood(food, householdId)
        pushed++
      } catch (e) {
        lastError = e.message
        console.error('pushLocalFoods failed:', food.name, e.message)
      }
    }
    return { pushed, error: lastError }
  } catch (e) {
    console.warn('pushLocalFoodsToHousehold error:', e)
    return { pushed: 0, error: e.message }
  }
}

// Push all local batches up to Supabase for household sharing
// Called at login to catch batches created before household was set up
export async function pushLocalBatchesToHousehold(householdId, email) {
  if (!householdId) return
  try {
    const batches = await db.batches.toArray()
    // Only push batches already marked as shared — never auto-promote personal batches
    const shared = batches.filter(b => b.shared === 1 || b.shared === true)
    if (!shared.length) return
    const { sbPushAllBatches } = await import('../db/db.js')
    await sbPushAllBatches(shared, email, householdId)
  } catch (e) {
    console.warn('pushLocalBatchesToHousehold error:', e)
  }
}

// ─── Active batches ───────────────────────────────────────────────────────────

/**
 * Get all open batches visible to this user — household batches + own personal batches.
 */
export async function getActiveBatches(userId, householdId) {
  const all = await db.batches
    .where('closed')
    .equals(0)
    .toArray()

  // Show household batches and the current user's personal batches only
  const relevant = all.filter(b =>
    (householdId && b.householdId === householdId) ||
    b.userId === userId
  )

  // Shared batches first, then personal
  return relevant.sort((a, b) => {
    if (a.shared && !b.shared) return -1
    if (!a.shared && b.shared) return 1
    return new Date(b.createdAt) - new Date(a.createdAt)
  })
}

// ─── Meal slot auto-detection ─────────────────────────────────────────────────

export function detectMealSlot() {
  const h = new Date().getHours()
  if (h < 12) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 19) return 'snack'
  return 'dinner'
}