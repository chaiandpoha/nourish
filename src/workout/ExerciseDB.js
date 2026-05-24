// Exercise database — 150+ exercises with muscle groups, equipment, alternates

export const EXERCISES = [
  // ── Chest ──────────────────────────────────────────────────────────────────
  { id:'ex001', name:'Bench Press',              muscle:'chest',     movement:'push',  equipment:'barbell', alternates:['ex002','ex003','ex004'] },
  { id:'ex002', name:'Incline Bench Press',      muscle:'chest',     movement:'push',  equipment:'barbell', alternates:['ex001','ex005'] },
  { id:'ex003', name:'Dumbbell Bench Press',     muscle:'chest',     movement:'push',  equipment:'dumbbell',alternates:['ex001','ex004'] },
  { id:'ex004', name:'Push Up',                  muscle:'chest',     movement:'push',  equipment:'none',    alternates:['ex001','ex003'] },
  { id:'ex005', name:'Incline Dumbbell Press',   muscle:'chest',     movement:'push',  equipment:'dumbbell',alternates:['ex002','ex003'] },
  { id:'ex006', name:'Cable Fly',                muscle:'chest',     movement:'push',  equipment:'cable',   alternates:['ex007','ex008'] },
  { id:'ex007', name:'Dumbbell Fly',             muscle:'chest',     movement:'push',  equipment:'dumbbell',alternates:['ex006','ex008'] },
  { id:'ex008', name:'Pec Deck',                 muscle:'chest',     movement:'push',  equipment:'machine', alternates:['ex006','ex007'] },
  { id:'ex009', name:'Decline Bench Press',      muscle:'chest',     movement:'push',  equipment:'barbell', alternates:['ex001','ex003'] },
  { id:'ex010', name:'Dips',                     muscle:'chest',     movement:'push',  equipment:'none',    alternates:['ex001','ex004'] },

  // ── Back ───────────────────────────────────────────────────────────────────
  { id:'ex011', name:'Deadlift',                 muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex012','ex013'] },
  { id:'ex012', name:'Romanian Deadlift',        muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex011','ex014'] },
  { id:'ex013', name:'Pull Up',                  muscle:'back',      movement:'pull',  equipment:'none',    alternates:['ex014','ex015'] },
  { id:'ex014', name:'Lat Pulldown',             muscle:'back',      movement:'pull',  equipment:'cable',   alternates:['ex013','ex015'] },
  { id:'ex015', name:'Seated Cable Row',         muscle:'back',      movement:'pull',  equipment:'cable',   alternates:['ex016','ex017'] },
  { id:'ex016', name:'Barbell Row',              muscle:'back',      movement:'pull',  equipment:'barbell', alternates:['ex015','ex017'] },
  { id:'ex017', name:'Dumbbell Row',             muscle:'back',      movement:'pull',  equipment:'dumbbell',alternates:['ex015','ex016'] },
  { id:'ex018', name:'T-Bar Row',                muscle:'back',      movement:'pull',  equipment:'barbell', alternates:['ex016','ex015'] },
  { id:'ex019', name:'Face Pull',                muscle:'back',      movement:'pull',  equipment:'cable',   alternates:['ex020'] },
  { id:'ex020', name:'Reverse Fly',              muscle:'back',      movement:'pull',  equipment:'dumbbell',alternates:['ex019'] },
  { id:'ex021', name:'Chin Up',                  muscle:'back',      movement:'pull',  equipment:'none',    alternates:['ex013','ex014'] },
  { id:'ex022', name:'Straight Arm Pulldown',    muscle:'back',      movement:'pull',  equipment:'cable',   alternates:['ex014'] },

  // ── Shoulders ──────────────────────────────────────────────────────────────
  { id:'ex023', name:'Overhead Press',           muscle:'shoulders', movement:'push',  equipment:'barbell', alternates:['ex024','ex025'] },
  { id:'ex024', name:'Dumbbell Shoulder Press',  muscle:'shoulders', movement:'push',  equipment:'dumbbell',alternates:['ex023','ex025'] },
  { id:'ex025', name:'Arnold Press',             muscle:'shoulders', movement:'push',  equipment:'dumbbell',alternates:['ex024','ex023'] },
  { id:'ex026', name:'Lateral Raise',            muscle:'shoulders', movement:'push',  equipment:'dumbbell',alternates:['ex027','ex028'] },
  { id:'ex027', name:'Cable Lateral Raise',      muscle:'shoulders', movement:'push',  equipment:'cable',   alternates:['ex026'] },
  { id:'ex028', name:'Machine Lateral Raise',    muscle:'shoulders', movement:'push',  equipment:'machine', alternates:['ex026','ex027'] },
  { id:'ex029', name:'Front Raise',              muscle:'shoulders', movement:'push',  equipment:'dumbbell',alternates:['ex030'] },
  { id:'ex030', name:'Cable Front Raise',        muscle:'shoulders', movement:'push',  equipment:'cable',   alternates:['ex029'] },
  { id:'ex031', name:'Upright Row',              muscle:'shoulders', movement:'pull',  equipment:'barbell', alternates:['ex026'] },
  { id:'ex032', name:'Shrugs',                   muscle:'shoulders', movement:'push',  equipment:'barbell', alternates:['ex033'] },
  { id:'ex033', name:'Dumbbell Shrugs',          muscle:'shoulders', movement:'push',  equipment:'dumbbell',alternates:['ex032'] },

  // ── Arms — Biceps ──────────────────────────────────────────────────────────
  { id:'ex034', name:'Barbell Curl',             muscle:'biceps',    movement:'pull',  equipment:'barbell', alternates:['ex035','ex036'] },
  { id:'ex035', name:'Dumbbell Curl',            muscle:'biceps',    movement:'pull',  equipment:'dumbbell',alternates:['ex034','ex036'] },
  { id:'ex036', name:'Cable Curl',               muscle:'biceps',    movement:'pull',  equipment:'cable',   alternates:['ex034','ex035'] },
  { id:'ex037', name:'Hammer Curl',              muscle:'biceps',    movement:'pull',  equipment:'dumbbell',alternates:['ex035'] },
  { id:'ex038', name:'Incline Dumbbell Curl',    muscle:'biceps',    movement:'pull',  equipment:'dumbbell',alternates:['ex035','ex034'] },
  { id:'ex039', name:'Concentration Curl',       muscle:'biceps',    movement:'pull',  equipment:'dumbbell',alternates:['ex035'] },
  { id:'ex040', name:'Preacher Curl',            muscle:'biceps',    movement:'pull',  equipment:'barbell', alternates:['ex034','ex036'] },
  { id:'ex041', name:'Spider Curl',              muscle:'biceps',    movement:'pull',  equipment:'barbell', alternates:['ex034'] },

  // ── Arms — Triceps ─────────────────────────────────────────────────────────
  { id:'ex042', name:'Tricep Pushdown',          muscle:'triceps',   movement:'push',  equipment:'cable',   alternates:['ex043','ex044'] },
  { id:'ex043', name:'Skull Crusher',            muscle:'triceps',   movement:'push',  equipment:'barbell', alternates:['ex042','ex045'] },
  { id:'ex044', name:'Overhead Tricep Extension',muscle:'triceps',   movement:'push',  equipment:'dumbbell',alternates:['ex042','ex043'] },
  { id:'ex045', name:'Close Grip Bench Press',   muscle:'triceps',   movement:'push',  equipment:'barbell', alternates:['ex043','ex042'] },
  { id:'ex046', name:'Tricep Kickback',          muscle:'triceps',   movement:'push',  equipment:'dumbbell',alternates:['ex042'] },
  { id:'ex047', name:'Diamond Push Up',          muscle:'triceps',   movement:'push',  equipment:'none',    alternates:['ex042','ex043'] },
  { id:'ex048', name:'Rope Pushdown',            muscle:'triceps',   movement:'push',  equipment:'cable',   alternates:['ex042'] },

  // ── Legs — Quads ───────────────────────────────────────────────────────────
  { id:'ex049', name:'Squat',                    muscle:'quads',     movement:'squat', equipment:'barbell', alternates:['ex050','ex051'] },
  { id:'ex050', name:'Front Squat',              muscle:'quads',     movement:'squat', equipment:'barbell', alternates:['ex049','ex051'] },
  { id:'ex051', name:'Goblet Squat',             muscle:'quads',     movement:'squat', equipment:'dumbbell',alternates:['ex049','ex052'] },
  { id:'ex052', name:'Leg Press',                muscle:'quads',     movement:'squat', equipment:'machine', alternates:['ex049','ex051'] },
  { id:'ex053', name:'Hack Squat',               muscle:'quads',     movement:'squat', equipment:'machine', alternates:['ex049','ex052'] },
  { id:'ex054', name:'Leg Extension',            muscle:'quads',     movement:'squat', equipment:'machine', alternates:['ex052'] },
  { id:'ex055', name:'Lunge',                    muscle:'quads',     movement:'squat', equipment:'dumbbell',alternates:['ex049','ex056'] },
  { id:'ex056', name:'Bulgarian Split Squat',    muscle:'quads',     movement:'squat', equipment:'dumbbell',alternates:['ex055','ex049'] },
  { id:'ex057', name:'Step Up',                  muscle:'quads',     movement:'squat', equipment:'dumbbell',alternates:['ex055'] },

  // ── Legs — Hamstrings ──────────────────────────────────────────────────────
  { id:'ex058', name:'Leg Curl',                 muscle:'hamstrings',movement:'hinge', equipment:'machine', alternates:['ex059','ex012'] },
  { id:'ex059', name:'Nordic Curl',              muscle:'hamstrings',movement:'hinge', equipment:'none',    alternates:['ex058'] },
  { id:'ex060', name:'Good Morning',             muscle:'hamstrings',movement:'hinge', equipment:'barbell', alternates:['ex012','ex011'] },
  { id:'ex061', name:'Stiff Leg Deadlift',       muscle:'hamstrings',movement:'hinge', equipment:'barbell', alternates:['ex012','ex058'] },
  { id:'ex062', name:'Seated Leg Curl',          muscle:'hamstrings',movement:'hinge', equipment:'machine', alternates:['ex058'] },

  // ── Legs — Glutes ──────────────────────────────────────────────────────────
  { id:'ex063', name:'Hip Thrust',               muscle:'glutes',    movement:'hinge', equipment:'barbell', alternates:['ex064','ex065'] },
  { id:'ex064', name:'Glute Bridge',             muscle:'glutes',    movement:'hinge', equipment:'none',    alternates:['ex063'] },
  { id:'ex065', name:'Cable Kickback',           muscle:'glutes',    movement:'hinge', equipment:'cable',   alternates:['ex063','ex064'] },
  { id:'ex066', name:'Sumo Deadlift',            muscle:'glutes',    movement:'hinge', equipment:'barbell', alternates:['ex011','ex063'] },

  // ── Legs — Calves ──────────────────────────────────────────────────────────
  { id:'ex067', name:'Standing Calf Raise',      muscle:'calves',    movement:'push',  equipment:'machine', alternates:['ex068','ex069'] },
  { id:'ex068', name:'Seated Calf Raise',        muscle:'calves',    movement:'push',  equipment:'machine', alternates:['ex067'] },
  { id:'ex069', name:'Donkey Calf Raise',        muscle:'calves',    movement:'push',  equipment:'none',    alternates:['ex067'] },

  // ── Core ───────────────────────────────────────────────────────────────────
  { id:'ex070', name:'Plank',                    muscle:'core',      movement:'core',  equipment:'none',    alternates:['ex071','ex072'] },
  { id:'ex071', name:'Ab Wheel Rollout',         muscle:'core',      movement:'core',  equipment:'none',    alternates:['ex070'] },
  { id:'ex072', name:'Cable Crunch',             muscle:'core',      movement:'core',  equipment:'cable',   alternates:['ex073'] },
  { id:'ex073', name:'Crunch',                   muscle:'core',      movement:'core',  equipment:'none',    alternates:['ex072','ex074'] },
  { id:'ex074', name:'Leg Raise',                muscle:'core',      movement:'core',  equipment:'none',    alternates:['ex073'] },
  { id:'ex075', name:'Russian Twist',            muscle:'core',      movement:'core',  equipment:'none',    alternates:['ex073'] },
  { id:'ex076', name:'Hanging Leg Raise',        muscle:'core',      movement:'core',  equipment:'none',    alternates:['ex074'] },
  { id:'ex077', name:'Side Plank',               muscle:'core',      movement:'core',  equipment:'none',    alternates:['ex070'] },
  { id:'ex078', name:'Dead Bug',                 muscle:'core',      movement:'core',  equipment:'none',    alternates:['ex070'] },
  { id:'ex079', name:'Pallof Press',             muscle:'core',      movement:'core',  equipment:'cable',   alternates:['ex070'] },

  // ── Cardio ─────────────────────────────────────────────────────────────────
  { id:'ex080', name:'Treadmill',                muscle:'cardio',    movement:'cardio',equipment:'machine', alternates:['ex081','ex082'] },
  { id:'ex081', name:'Cycling',                  muscle:'cardio',    movement:'cardio',equipment:'machine', alternates:['ex080','ex083'] },
  { id:'ex082', name:'Rowing Machine',           muscle:'cardio',    movement:'cardio',equipment:'machine', alternates:['ex080','ex081'] },
  { id:'ex083', name:'Jump Rope',                muscle:'cardio',    movement:'cardio',equipment:'none',    alternates:['ex080'] },
  { id:'ex084', name:'Stair Climber',            muscle:'cardio',    movement:'cardio',equipment:'machine', alternates:['ex080'] },
  { id:'ex085', name:'Elliptical',               muscle:'cardio',    movement:'cardio',equipment:'machine', alternates:['ex080','ex081'] },
  { id:'ex086', name:'Battle Ropes',             muscle:'cardio',    movement:'cardio',equipment:'none',    alternates:['ex083'] },

  // ── Olympic / Power ────────────────────────────────────────────────────────
  { id:'ex087', name:'Power Clean',              muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex011'] },
  { id:'ex088', name:'Hang Clean',               muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex087'] },
  { id:'ex089', name:'Snatch',                   muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex087'] },
  { id:'ex090', name:'Clean and Jerk',           muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex087'] },

  // ── Compound full body ─────────────────────────────────────────────────────
  { id:'ex091', name:'Burpee',                   muscle:'full body', movement:'cardio',equipment:'none',    alternates:['ex083'] },
  { id:'ex092', name:'Kettlebell Swing',         muscle:'full body', movement:'hinge', equipment:'kettlebell',alternates:['ex063','ex011'] },
  { id:'ex093', name:'Thruster',                 muscle:'full body', movement:'squat', equipment:'barbell', alternates:['ex049','ex023'] },
  { id:'ex094', name:'Man Maker',                muscle:'full body', movement:'push',  equipment:'dumbbell',alternates:['ex091'] },

  // ── Forearms ───────────────────────────────────────────────────────────────
  { id:'ex095', name:'Wrist Curl',               muscle:'forearms',  movement:'pull',  equipment:'barbell', alternates:['ex096'] },
  { id:'ex096', name:'Reverse Wrist Curl',       muscle:'forearms',  movement:'push',  equipment:'barbell', alternates:['ex095'] },
  { id:'ex097', name:'Farmers Walk',             muscle:'forearms',  movement:'carry', equipment:'dumbbell',alternates:['ex095'] },

  // ── Additional popular exercises ───────────────────────────────────────────
  { id:'ex098', name:'Incline Curl',             muscle:'biceps',    movement:'pull',  equipment:'dumbbell',alternates:['ex035'] },
  { id:'ex099', name:'Zottman Curl',             muscle:'biceps',    movement:'pull',  equipment:'dumbbell',alternates:['ex035','ex037'] },
  { id:'ex100', name:'Machine Chest Press',      muscle:'chest',     movement:'push',  equipment:'machine', alternates:['ex001','ex003'] },
  { id:'ex101', name:'Smith Machine Squat',      muscle:'quads',     movement:'squat', equipment:'machine', alternates:['ex049','ex052'] },
  { id:'ex102', name:'Smith Machine Bench',      muscle:'chest',     movement:'push',  equipment:'machine', alternates:['ex001','ex003'] },
  { id:'ex103', name:'Trap Bar Deadlift',        muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex011'] },
  { id:'ex104', name:'Pendlay Row',              muscle:'back',      movement:'pull',  equipment:'barbell', alternates:['ex016'] },
  { id:'ex105', name:'Meadows Row',              muscle:'back',      movement:'pull',  equipment:'barbell', alternates:['ex017'] },
  { id:'ex106', name:'Single Arm Cable Row',     muscle:'back',      movement:'pull',  equipment:'cable',   alternates:['ex015','ex017'] },
  { id:'ex107', name:'Chest Supported Row',      muscle:'back',      movement:'pull',  equipment:'dumbbell',alternates:['ex017','ex015'] },
  { id:'ex108', name:'Seal Row',                 muscle:'back',      movement:'pull',  equipment:'barbell', alternates:['ex016','ex017'] },
  { id:'ex109', name:'Cable Crossover',          muscle:'chest',     movement:'push',  equipment:'cable',   alternates:['ex006','ex007'] },
  { id:'ex110', name:'Landmine Press',           muscle:'shoulders', movement:'push',  equipment:'barbell', alternates:['ex023','ex024'] },
  { id:'ex111', name:'Bradford Press',           muscle:'shoulders', movement:'push',  equipment:'barbell', alternates:['ex023'] },
  { id:'ex112', name:'Cuban Press',              muscle:'shoulders', movement:'push',  equipment:'dumbbell',alternates:['ex024'] },
  { id:'ex113', name:'Sissy Squat',              muscle:'quads',     movement:'squat', equipment:'none',    alternates:['ex054'] },
  { id:'ex114', name:'Wall Sit',                 muscle:'quads',     movement:'squat', equipment:'none',    alternates:['ex052'] },
  { id:'ex115', name:'Box Jump',                 muscle:'quads',     movement:'squat', equipment:'none',    alternates:['ex049'] },
  { id:'ex116', name:'Sled Push',                muscle:'quads',     movement:'squat', equipment:'machine', alternates:['ex052'] },
  { id:'ex117', name:'Sled Pull',                muscle:'hamstrings',movement:'hinge', equipment:'machine', alternates:['ex058'] },
  { id:'ex118', name:'GHD Raise',                muscle:'hamstrings',movement:'hinge', equipment:'machine', alternates:['ex059','ex058'] },
  { id:'ex119', name:'Reverse Hyper',            muscle:'glutes',    movement:'hinge', equipment:'machine', alternates:['ex063'] },
  { id:'ex120', name:'Abductor Machine',         muscle:'glutes',    movement:'push',  equipment:'machine', alternates:['ex065'] },
  { id:'ex121', name:'Adductor Machine',         muscle:'glutes',    movement:'pull',  equipment:'machine', alternates:['ex065'] },
  { id:'ex122', name:'Back Extension',           muscle:'back',      movement:'hinge', equipment:'machine', alternates:['ex012','ex060'] },
  { id:'ex123', name:'Hyperextension',           muscle:'back',      movement:'hinge', equipment:'none',    alternates:['ex122','ex012'] },
  { id:'ex124', name:'Single Leg Deadlift',      muscle:'hamstrings',movement:'hinge', equipment:'dumbbell',alternates:['ex012','ex061'] },
  { id:'ex125', name:'Sumo Squat',               muscle:'quads',     movement:'squat', equipment:'dumbbell',alternates:['ex051','ex049'] },
  { id:'ex126', name:'Pause Squat',              muscle:'quads',     movement:'squat', equipment:'barbell', alternates:['ex049'] },
  { id:'ex127', name:'Tempo Bench Press',        muscle:'chest',     movement:'push',  equipment:'barbell', alternates:['ex001'] },
  { id:'ex128', name:'Paused Deadlift',          muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex011'] },
  { id:'ex129', name:'Block Pull',               muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex011'] },
  { id:'ex130', name:'Rack Pull',                muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex011','ex129'] },
  { id:'ex131', name:'Jefferson Curl',           muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex012'] },
  { id:'ex132', name:'Deficit Deadlift',         muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex011'] },
  { id:'ex133', name:'Sumo Deadlift High Pull',  muscle:'back',      movement:'hinge', equipment:'barbell', alternates:['ex087'] },
  { id:'ex134', name:'Cable Pull Through',       muscle:'glutes',    movement:'hinge', equipment:'cable',   alternates:['ex063','ex092'] },
  { id:'ex135', name:'Hip Abduction',            muscle:'glutes',    movement:'push',  equipment:'cable',   alternates:['ex120'] },
  { id:'ex136', name:'Cossack Squat',            muscle:'quads',     movement:'squat', equipment:'none',    alternates:['ex055','ex056'] },
  { id:'ex137', name:'Jefferson Squat',          muscle:'quads',     movement:'squat', equipment:'barbell', alternates:['ex049'] },
  { id:'ex138', name:'Zercher Squat',            muscle:'quads',     movement:'squat', equipment:'barbell', alternates:['ex049','ex050'] },
  { id:'ex139', name:'Safety Bar Squat',         muscle:'quads',     movement:'squat', equipment:'barbell', alternates:['ex049'] },
  { id:'ex140', name:'Cambered Bar Squat',       muscle:'quads',     movement:'squat', equipment:'barbell', alternates:['ex049'] },
  { id:'ex141', name:'Kneeling Squat',           muscle:'quads',     movement:'squat', equipment:'barbell', alternates:['ex049'] },
  { id:'ex142', name:'Landmine Squat',           muscle:'quads',     movement:'squat', equipment:'barbell', alternates:['ex051'] },
  { id:'ex143', name:'Heel Elevated Squat',      muscle:'quads',     movement:'squat', equipment:'barbell', alternates:['ex049','ex050'] },
  { id:'ex144', name:'Bodyweight Squat',         muscle:'quads',     movement:'squat', equipment:'none',    alternates:['ex049','ex051'] },
  { id:'ex145', name:'Jump Squat',               muscle:'quads',     movement:'squat', equipment:'none',    alternates:['ex115','ex049'] },
  { id:'ex146', name:'Pistol Squat',             muscle:'quads',     movement:'squat', equipment:'none',    alternates:['ex056'] },
  { id:'ex147', name:'TRX Row',                  muscle:'back',      movement:'pull',  equipment:'none',    alternates:['ex013','ex015'] },
  { id:'ex148', name:'TRX Push Up',              muscle:'chest',     movement:'push',  equipment:'none',    alternates:['ex004'] },
  { id:'ex149', name:'Band Pull Apart',          muscle:'back',      movement:'pull',  equipment:'none',    alternates:['ex019','ex020'] },
  { id:'ex150', name:'Resistance Band Curl',     muscle:'biceps',    movement:'pull',  equipment:'none',    alternates:['ex035'] },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getExerciseById(id) {
  return EXERCISES.find(e => e.id === id) || null
}

export function searchExercises(query, limit = 10) {
  if (!query.trim()) return EXERCISES.slice(0, limit)
  const q = query.toLowerCase()
  return EXERCISES
    .filter(e => e.name.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q))
    .slice(0, limit)
}

export function getByMuscle(muscle) {
  return EXERCISES.filter(e => e.muscle === muscle)
}

export function getAlternates(exerciseId) {
  const ex = getExerciseById(exerciseId)
  if (!ex) return []
  return ex.alternates.map(id => getExerciseById(id)).filter(Boolean)
}

export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core',
  'cardio', 'forearms', 'full body'
]

export const MOVEMENTS = ['push', 'pull', 'squat', 'hinge', 'core', 'cardio', 'carry']