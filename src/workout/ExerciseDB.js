
export const EXERCISES = [
  // ── Chest ──────────────────────────────────────────────────────────────────
  { id:'ex001', name:'Barbell Bench Press',         muscle:'Chest',       movement:'push',  equipment:'Barbell',    alternates:['ex002','ex003','ex004'] },
  { id:'ex002', name:'Incline Barbell Press',       muscle:'Chest',       movement:'push',  equipment:'Barbell',    alternates:['ex001','ex005'] },
  { id:'ex003', name:'Dumbbell Bench Press',        muscle:'Chest',       movement:'push',  equipment:'Dumbbell',   alternates:['ex001','ex004'] },
  { id:'ex004', name:'Push Up',                     muscle:'Chest',       movement:'push',  equipment:'Bodyweight', alternates:['ex001','ex003'] },
  { id:'ex005', name:'Incline Dumbbell Press',      muscle:'Chest',       movement:'push',  equipment:'Dumbbell',   alternates:['ex002','ex003'] },
  { id:'ex006', name:'Decline Barbell Press',       muscle:'Chest',       movement:'push',  equipment:'Barbell',    alternates:['ex001','ex003'] },
  { id:'ex007', name:'Decline Dumbbell Press',      muscle:'Chest',       movement:'push',  equipment:'Dumbbell',   alternates:['ex006','ex003'] },
  { id:'ex008', name:'Cable Fly',                   muscle:'Chest',       movement:'push',  equipment:'Cable',      alternates:['ex009','ex010'] },
  { id:'ex009', name:'Dumbbell Fly',                muscle:'Chest',       movement:'push',  equipment:'Dumbbell',   alternates:['ex008','ex010'] },
  { id:'ex010', name:'Pec Deck',                    muscle:'Chest',       movement:'push',  equipment:'Machine',    alternates:['ex008','ex009'] },
  { id:'ex011', name:'Machine Chest Press',         muscle:'Chest',       movement:'push',  equipment:'Machine',    alternates:['ex001','ex003'] },
  { id:'ex012', name:'Smith Machine Bench Press',   muscle:'Chest',       movement:'push',  equipment:'Machine',    alternates:['ex001','ex003'] },
  { id:'ex013', name:'Cable Crossover',             muscle:'Chest',       movement:'push',  equipment:'Cable',      alternates:['ex008','ex009'] },
  { id:'ex014', name:'Chest Dips',                  muscle:'Chest',       movement:'push',  equipment:'Bodyweight', alternates:['ex001','ex004'] },
  { id:'ex015', name:'Low Cable Fly',               muscle:'Chest',       movement:'push',  equipment:'Cable',      alternates:['ex008'] },
  { id:'ex016', name:'High Cable Fly',              muscle:'Chest',       movement:'push',  equipment:'Cable',      alternates:['ex008'] },
  { id:'ex017', name:'Svend Press',                 muscle:'Chest',       movement:'push',  equipment:'Plate',      alternates:['ex010'] },
  { id:'ex018', name:'Landmine Press',              muscle:'Chest',       movement:'push',  equipment:'Barbell',    alternates:['ex002','ex005'] },
  { id:'ex019', name:'Wide Push Up',                muscle:'Chest',       movement:'push',  equipment:'Bodyweight', alternates:['ex004'] },
  { id:'ex020', name:'Diamond Push Up',             muscle:'Chest',       movement:'push',  equipment:'Bodyweight', alternates:['ex004'] },

  // ── Back ───────────────────────────────────────────────────────────────────
  { id:'ex021', name:'Deadlift',                    muscle:'Back',        movement:'hinge', equipment:'Barbell',    alternates:['ex022','ex023'] },
  { id:'ex022', name:'Romanian Deadlift',           muscle:'Back',        movement:'hinge', equipment:'Barbell',    alternates:['ex021','ex024'] },
  { id:'ex023', name:'Trap Bar Deadlift',           muscle:'Back',        movement:'hinge', equipment:'Barbell',    alternates:['ex021'] },
  { id:'ex024', name:'Sumo Deadlift',               muscle:'Back',        movement:'hinge', equipment:'Barbell',    alternates:['ex021','ex022'] },
  { id:'ex025', name:'Pull Up',                     muscle:'Back',        movement:'pull',  equipment:'Bodyweight', alternates:['ex026','ex027'] },
  { id:'ex026', name:'Chin Up',                     muscle:'Back',        movement:'pull',  equipment:'Bodyweight', alternates:['ex025','ex027'] },
  { id:'ex027', name:'Lat Pulldown',                muscle:'Back',        movement:'pull',  equipment:'Cable',      alternates:['ex025','ex026'] },
  { id:'ex028', name:'Wide Grip Lat Pulldown',      muscle:'Back',        movement:'pull',  equipment:'Cable',      alternates:['ex027','ex025'] },
  { id:'ex029', name:'Close Grip Lat Pulldown',     muscle:'Back',        movement:'pull',  equipment:'Cable',      alternates:['ex027'] },
  { id:'ex030', name:'Seated Cable Row',            muscle:'Back',        movement:'pull',  equipment:'Cable',      alternates:['ex031','ex032'] },
  { id:'ex031', name:'Barbell Row',                 muscle:'Back',        movement:'pull',  equipment:'Barbell',    alternates:['ex030','ex032'] },
  { id:'ex032', name:'Dumbbell Row',                muscle:'Back',        movement:'pull',  equipment:'Dumbbell',   alternates:['ex030','ex031'] },
  { id:'ex033', name:'T-Bar Row',                   muscle:'Back',        movement:'pull',  equipment:'Barbell',    alternates:['ex031','ex030'] },
  { id:'ex034', name:'Pendlay Row',                 muscle:'Back',        movement:'pull',  equipment:'Barbell',    alternates:['ex031'] },
  { id:'ex035', name:'Chest Supported Row',         muscle:'Back',        movement:'pull',  equipment:'Dumbbell',   alternates:['ex032','ex030'] },
  { id:'ex036', name:'Single Arm Cable Row',        muscle:'Back',        movement:'pull',  equipment:'Cable',      alternates:['ex032','ex030'] },
  { id:'ex037', name:'Face Pull',                   muscle:'Back',        movement:'pull',  equipment:'Cable',      alternates:['ex038'] },
  { id:'ex038', name:'Reverse Fly',                 muscle:'Back',        movement:'pull',  equipment:'Dumbbell',   alternates:['ex037'] },
  { id:'ex039', name:'Straight Arm Pulldown',       muscle:'Back',        movement:'pull',  equipment:'Cable',      alternates:['ex027'] },
  { id:'ex040', name:'Rack Pull',                   muscle:'Back',        movement:'hinge', equipment:'Barbell',    alternates:['ex021'] },
  { id:'ex041', name:'Deficit Deadlift',            muscle:'Back',        movement:'hinge', equipment:'Barbell',    alternates:['ex021'] },
  { id:'ex042', name:'Paused Deadlift',             muscle:'Back',        movement:'hinge', equipment:'Barbell',    alternates:['ex021'] },
  { id:'ex043', name:'Back Extension',              muscle:'Back',        movement:'hinge', equipment:'Machine',    alternates:['ex022'] },
  { id:'ex044', name:'Hyperextension',              muscle:'Back',        movement:'hinge', equipment:'Bodyweight', alternates:['ex043'] },
  { id:'ex045', name:'Good Morning',                muscle:'Back',        movement:'hinge', equipment:'Barbell',    alternates:['ex022'] },
  { id:'ex046', name:'TRX Row',                     muscle:'Back',        movement:'pull',  equipment:'Bodyweight', alternates:['ex025','ex030'] },
  { id:'ex047', name:'Band Pull Apart',             muscle:'Back',        movement:'pull',  equipment:'Band',       alternates:['ex037','ex038'] },
  { id:'ex048', name:'Seal Row',                    muscle:'Back',        movement:'pull',  equipment:'Barbell',    alternates:['ex031','ex032'] },
  { id:'ex049', name:'Meadows Row',                 muscle:'Back',        movement:'pull',  equipment:'Barbell',    alternates:['ex032'] },
  { id:'ex050', name:'Jefferson Curl',              muscle:'Back',        movement:'hinge', equipment:'Barbell',    alternates:['ex022'] },

  // ── Shoulders ──────────────────────────────────────────────────────────────
  { id:'ex051', name:'Overhead Press',              muscle:'Shoulders',   movement:'push',  equipment:'Barbell',    alternates:['ex052','ex053'] },
  { id:'ex052', name:'Dumbbell Shoulder Press',     muscle:'Shoulders',   movement:'push',  equipment:'Dumbbell',   alternates:['ex051','ex053'] },
  { id:'ex053', name:'Arnold Press',                muscle:'Shoulders',   movement:'push',  equipment:'Dumbbell',   alternates:['ex052','ex051'] },
  { id:'ex054', name:'Machine Shoulder Press',      muscle:'Shoulders',   movement:'push',  equipment:'Machine',    alternates:['ex051','ex052'] },
  { id:'ex055', name:'Smith Machine Press',         muscle:'Shoulders',   movement:'push',  equipment:'Machine',    alternates:['ex051'] },
  { id:'ex056', name:'Lateral Raise',               muscle:'Shoulders',   movement:'push',  equipment:'Dumbbell',   alternates:['ex057','ex058'] },
  { id:'ex057', name:'Cable Lateral Raise',         muscle:'Shoulders',   movement:'push',  equipment:'Cable',      alternates:['ex056'] },
  { id:'ex058', name:'Machine Lateral Raise',       muscle:'Shoulders',   movement:'push',  equipment:'Machine',    alternates:['ex056','ex057'] },
  { id:'ex059', name:'Front Raise',                 muscle:'Shoulders',   movement:'push',  equipment:'Dumbbell',   alternates:['ex060'] },
  { id:'ex060', name:'Cable Front Raise',           muscle:'Shoulders',   movement:'push',  equipment:'Cable',      alternates:['ex059'] },
  { id:'ex061', name:'Upright Row',                 muscle:'Shoulders',   movement:'pull',  equipment:'Barbell',    alternates:['ex056'] },
  { id:'ex062', name:'Barbell Shrug',               muscle:'Shoulders',   movement:'push',  equipment:'Barbell',    alternates:['ex063'] },
  { id:'ex063', name:'Dumbbell Shrug',              muscle:'Shoulders',   movement:'push',  equipment:'Dumbbell',   alternates:['ex062'] },
  { id:'ex064', name:'Bradford Press',              muscle:'Shoulders',   movement:'push',  equipment:'Barbell',    alternates:['ex051'] },
  { id:'ex065', name:'Cuban Press',                 muscle:'Shoulders',   movement:'push',  equipment:'Dumbbell',   alternates:['ex052'] },
  { id:'ex066', name:'Behind The Neck Press',       muscle:'Shoulders',   movement:'push',  equipment:'Barbell',    alternates:['ex051'] },
  { id:'ex067', name:'Push Press',                  muscle:'Shoulders',   movement:'push',  equipment:'Barbell',    alternates:['ex051'] },

  // ── Biceps ─────────────────────────────────────────────────────────────────
  { id:'ex068', name:'Barbell Curl',                muscle:'Biceps',      movement:'pull',  equipment:'Barbell',    alternates:['ex069','ex070'] },
  { id:'ex069', name:'Dumbbell Curl',               muscle:'Biceps',      movement:'pull',  equipment:'Dumbbell',   alternates:['ex068','ex070'] },
  { id:'ex070', name:'Cable Curl',                  muscle:'Biceps',      movement:'pull',  equipment:'Cable',      alternates:['ex068','ex069'] },
  { id:'ex071', name:'Hammer Curl',                 muscle:'Biceps',      movement:'pull',  equipment:'Dumbbell',   alternates:['ex069'] },
  { id:'ex072', name:'Incline Dumbbell Curl',       muscle:'Biceps',      movement:'pull',  equipment:'Dumbbell',   alternates:['ex069','ex068'] },
  { id:'ex073', name:'Concentration Curl',          muscle:'Biceps',      movement:'pull',  equipment:'Dumbbell',   alternates:['ex069'] },
  { id:'ex074', name:'Preacher Curl',               muscle:'Biceps',      movement:'pull',  equipment:'Barbell',    alternates:['ex068','ex070'] },
  { id:'ex075', name:'Spider Curl',                 muscle:'Biceps',      movement:'pull',  equipment:'Barbell',    alternates:['ex068'] },
  { id:'ex076', name:'Zottman Curl',                muscle:'Biceps',      movement:'pull',  equipment:'Dumbbell',   alternates:['ex069','ex071'] },
  { id:'ex077', name:'Cross Body Curl',             muscle:'Biceps',      movement:'pull',  equipment:'Dumbbell',   alternates:['ex071'] },
  { id:'ex078', name:'Resistance Band Curl',        muscle:'Biceps',      movement:'pull',  equipment:'Band',       alternates:['ex069'] },
  { id:'ex079', name:'EZ Bar Curl',                 muscle:'Biceps',      movement:'pull',  equipment:'Barbell',    alternates:['ex068'] },
  { id:'ex080', name:'Reverse Curl',                muscle:'Biceps',      movement:'pull',  equipment:'Barbell',    alternates:['ex068'] },
  { id:'ex081', name:'21s',                         muscle:'Biceps',      movement:'pull',  equipment:'Barbell',    alternates:['ex068'] },

  // ── Triceps ────────────────────────────────────────────────────────────────
  { id:'ex082', name:'Tricep Pushdown',             muscle:'Triceps',     movement:'push',  equipment:'Cable',      alternates:['ex083','ex084'] },
  { id:'ex083', name:'Rope Pushdown',               muscle:'Triceps',     movement:'push',  equipment:'Cable',      alternates:['ex082'] },
  { id:'ex084', name:'Skull Crusher',               muscle:'Triceps',     movement:'push',  equipment:'Barbell',    alternates:['ex082','ex085'] },
  { id:'ex085', name:'Overhead Tricep Extension',   muscle:'Triceps',     movement:'push',  equipment:'Dumbbell',   alternates:['ex082','ex084'] },
  { id:'ex086', name:'Close Grip Bench Press',      muscle:'Triceps',     movement:'push',  equipment:'Barbell',    alternates:['ex084','ex082'] },
  { id:'ex087', name:'Tricep Kickback',             muscle:'Triceps',     movement:'push',  equipment:'Dumbbell',   alternates:['ex082'] },
  { id:'ex088', name:'Tricep Dips',                 muscle:'Triceps',     movement:'push',  equipment:'Bodyweight', alternates:['ex082','ex084'] },
  { id:'ex089', name:'Overhead Cable Extension',    muscle:'Triceps',     movement:'push',  equipment:'Cable',      alternates:['ex085','ex082'] },
  { id:'ex090', name:'EZ Bar Skull Crusher',        muscle:'Triceps',     movement:'push',  equipment:'Barbell',    alternates:['ex084'] },
  { id:'ex091', name:'Single Arm Pushdown',         muscle:'Triceps',     movement:'push',  equipment:'Cable',      alternates:['ex082'] },
  { id:'ex092', name:'Bench Dips',                  muscle:'Triceps',     movement:'push',  equipment:'Bodyweight', alternates:['ex088'] },

  // ── Quads ──────────────────────────────────────────────────────────────────
  { id:'ex093', name:'Barbell Squat',               muscle:'Quads',       movement:'squat', equipment:'Barbell',    alternates:['ex094','ex095'] },
  { id:'ex094', name:'Front Squat',                 muscle:'Quads',       movement:'squat', equipment:'Barbell',    alternates:['ex093','ex095'] },
  { id:'ex095', name:'Goblet Squat',                muscle:'Quads',       movement:'squat', equipment:'Dumbbell',   alternates:['ex093','ex096'] },
  { id:'ex096', name:'Leg Press',                   muscle:'Quads',       movement:'squat', equipment:'Machine',    alternates:['ex093','ex095'] },
  { id:'ex097', name:'Hack Squat',                  muscle:'Quads',       movement:'squat', equipment:'Machine',    alternates:['ex093','ex096'] },
  { id:'ex098', name:'Leg Extension',               muscle:'Quads',       movement:'squat', equipment:'Machine',    alternates:['ex096'] },
  { id:'ex099', name:'Lunge',                       muscle:'Quads',       movement:'squat', equipment:'Dumbbell',   alternates:['ex093','ex100'] },
  { id:'ex100', name:'Bulgarian Split Squat',       muscle:'Quads',       movement:'squat', equipment:'Dumbbell',   alternates:['ex099','ex093'] },
  { id:'ex101', name:'Step Up',                     muscle:'Quads',       movement:'squat', equipment:'Dumbbell',   alternates:['ex099'] },
  { id:'ex102', name:'Smith Machine Squat',         muscle:'Quads',       movement:'squat', equipment:'Machine',    alternates:['ex093','ex096'] },
  { id:'ex103', name:'Sissy Squat',                 muscle:'Quads',       movement:'squat', equipment:'Bodyweight', alternates:['ex098'] },
  { id:'ex104', name:'Wall Sit',                    muscle:'Quads',       movement:'squat', equipment:'Bodyweight', alternates:['ex096'] },
  { id:'ex105', name:'Box Jump',                    muscle:'Quads',       movement:'squat', equipment:'Bodyweight', alternates:['ex093'] },
  { id:'ex106', name:'Sled Push',                   muscle:'Quads',       movement:'squat', equipment:'Machine',    alternates:['ex096'] },
  { id:'ex107', name:'Pause Squat',                 muscle:'Quads',       movement:'squat', equipment:'Barbell',    alternates:['ex093'] },
  { id:'ex108', name:'Heel Elevated Squat',         muscle:'Quads',       movement:'squat', equipment:'Barbell',    alternates:['ex093','ex094'] },
  { id:'ex109', name:'Zercher Squat',               muscle:'Quads',       movement:'squat', equipment:'Barbell',    alternates:['ex093'] },
  { id:'ex110', name:'Cossack Squat',               muscle:'Quads',       movement:'squat', equipment:'Bodyweight', alternates:['ex099','ex100'] },
  { id:'ex111', name:'Pistol Squat',                muscle:'Quads',       movement:'squat', equipment:'Bodyweight', alternates:['ex100'] },
  { id:'ex112', name:'Jump Squat',                  muscle:'Quads',       movement:'squat', equipment:'Bodyweight', alternates:['ex105','ex093'] },
  { id:'ex113', name:'Bodyweight Squat',            muscle:'Quads',       movement:'squat', equipment:'Bodyweight', alternates:['ex093','ex095'] },
  { id:'ex114', name:'Reverse Lunge',               muscle:'Quads',       movement:'squat', equipment:'Dumbbell',   alternates:['ex099'] },
  { id:'ex115', name:'Walking Lunge',               muscle:'Quads',       movement:'squat', equipment:'Dumbbell',   alternates:['ex099'] },
  { id:'ex116', name:'Landmine Squat',              muscle:'Quads',       movement:'squat', equipment:'Barbell',    alternates:['ex095'] },

  // ── Hamstrings ─────────────────────────────────────────────────────────────
  { id:'ex117', name:'Lying Leg Curl',              muscle:'Hamstrings',  movement:'hinge', equipment:'Machine',    alternates:['ex118','ex022'] },
  { id:'ex118', name:'Seated Leg Curl',             muscle:'Hamstrings',  movement:'hinge', equipment:'Machine',    alternates:['ex117'] },
  { id:'ex119', name:'Nordic Curl',                 muscle:'Hamstrings',  movement:'hinge', equipment:'Bodyweight', alternates:['ex117'] },
  { id:'ex120', name:'Stiff Leg Deadlift',          muscle:'Hamstrings',  movement:'hinge', equipment:'Barbell',    alternates:['ex022','ex117'] },
  { id:'ex121', name:'Single Leg Deadlift',         muscle:'Hamstrings',  movement:'hinge', equipment:'Dumbbell',   alternates:['ex022','ex120'] },
  { id:'ex122', name:'Glute Ham Raise',             muscle:'Hamstrings',  movement:'hinge', equipment:'Machine',    alternates:['ex119','ex117'] },
  { id:'ex123', name:'Cable Pull Through',          muscle:'Hamstrings',  movement:'hinge', equipment:'Cable',      alternates:['ex022'] },
  { id:'ex124', name:'Sled Pull',                   muscle:'Hamstrings',  movement:'hinge', equipment:'Machine',    alternates:['ex117'] },

  // ── Glutes ─────────────────────────────────────────────────────────────────
  { id:'ex125', name:'Hip Thrust',                  muscle:'Glutes',      movement:'hinge', equipment:'Barbell',    alternates:['ex126','ex127'] },
  { id:'ex126', name:'Glute Bridge',                muscle:'Glutes',      movement:'hinge', equipment:'Bodyweight', alternates:['ex125'] },
  { id:'ex127', name:'Cable Kickback',              muscle:'Glutes',      movement:'hinge', equipment:'Cable',      alternates:['ex125','ex126'] },
  { id:'ex128', name:'Abductor Machine',            muscle:'Glutes',      movement:'push',  equipment:'Machine',    alternates:['ex127'] },
  { id:'ex129', name:'Adductor Machine',            muscle:'Glutes',      movement:'pull',  equipment:'Machine',    alternates:['ex127'] },
  { id:'ex130', name:'Donkey Kick',                 muscle:'Glutes',      movement:'hinge', equipment:'Bodyweight', alternates:['ex126'] },
  { id:'ex131', name:'Fire Hydrant',                muscle:'Glutes',      movement:'push',  equipment:'Bodyweight', alternates:['ex128'] },
  { id:'ex132', name:'Reverse Hyper',               muscle:'Glutes',      movement:'hinge', equipment:'Machine',    alternates:['ex125'] },
  { id:'ex133', name:'Hip Abduction',               muscle:'Glutes',      movement:'push',  equipment:'Cable',      alternates:['ex128'] },
  { id:'ex134', name:'Sumo Walk',                   muscle:'Glutes',      movement:'push',  equipment:'Band',       alternates:['ex128'] },

  // ── Calves ─────────────────────────────────────────────────────────────────
  { id:'ex135', name:'Standing Calf Raise',         muscle:'Calves',      movement:'push',  equipment:'Machine',    alternates:['ex136','ex137'] },
  { id:'ex136', name:'Seated Calf Raise',           muscle:'Calves',      movement:'push',  equipment:'Machine',    alternates:['ex135'] },
  { id:'ex137', name:'Donkey Calf Raise',           muscle:'Calves',      movement:'push',  equipment:'Bodyweight', alternates:['ex135'] },
  { id:'ex138', name:'Single Leg Calf Raise',       muscle:'Calves',      movement:'push',  equipment:'Bodyweight', alternates:['ex135'] },
  { id:'ex139', name:'Leg Press Calf Raise',        muscle:'Calves',      movement:'push',  equipment:'Machine',    alternates:['ex135'] },

  // ── Core ───────────────────────────────────────────────────────────────────
  { id:'ex140', name:'Plank',                       muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex141','ex142'] },
  { id:'ex141', name:'Ab Wheel Rollout',            muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex140'] },
  { id:'ex142', name:'Cable Crunch',                muscle:'Core',        movement:'core',  equipment:'Cable',      alternates:['ex143'] },
  { id:'ex143', name:'Crunch',                      muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex142','ex144'] },
  { id:'ex144', name:'Leg Raise',                   muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex143'] },
  { id:'ex145', name:'Russian Twist',               muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex143'] },
  { id:'ex146', name:'Hanging Leg Raise',           muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex144'] },
  { id:'ex147', name:'Side Plank',                  muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex140'] },
  { id:'ex148', name:'Dead Bug',                    muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex140'] },
  { id:'ex149', name:'Pallof Press',                muscle:'Core',        movement:'core',  equipment:'Cable',      alternates:['ex140'] },
  { id:'ex150', name:'V Up',                        muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex143'] },
  { id:'ex151', name:'Bicycle Crunch',              muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex143'] },
  { id:'ex152', name:'Dragon Flag',                 muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex141'] },
  { id:'ex153', name:'Hollow Hold',                 muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex140'] },
  { id:'ex154', name:'L Sit',                       muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex140'] },
  { id:'ex155', name:'Toe Touch',                   muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex143'] },
  { id:'ex156', name:'Flutter Kick',                muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex144'] },
  { id:'ex157', name:'Mountain Climber',            muscle:'Core',        movement:'core',  equipment:'Bodyweight', alternates:['ex140'] },
  { id:'ex158', name:'Wood Chop',                   muscle:'Core',        movement:'core',  equipment:'Cable',      alternates:['ex145'] },
  { id:'ex159', name:'Landmine Rotation',           muscle:'Core',        movement:'core',  equipment:'Barbell',    alternates:['ex158'] },

  // ── Cardio ─────────────────────────────────────────────────────────────────
  { id:'ex160', name:'Treadmill',                   muscle:'Cardio',      movement:'cardio',equipment:'Machine',    alternates:['ex161','ex162'] },
  { id:'ex161', name:'Cycling',                     muscle:'Cardio',      movement:'cardio',equipment:'Machine',    alternates:['ex160','ex163'] },
  { id:'ex162', name:'Rowing Machine',              muscle:'Cardio',      movement:'cardio',equipment:'Machine',    alternates:['ex160','ex161'] },
  { id:'ex163', name:'Jump Rope',                   muscle:'Cardio',      movement:'cardio',equipment:'Bodyweight', alternates:['ex160'] },
  { id:'ex164', name:'Stair Climber',               muscle:'Cardio',      movement:'cardio',equipment:'Machine',    alternates:['ex160'] },
  { id:'ex165', name:'Elliptical',                  muscle:'Cardio',      movement:'cardio',equipment:'Machine',    alternates:['ex160','ex161'] },
  { id:'ex166', name:'Battle Ropes',                muscle:'Cardio',      movement:'cardio',equipment:'Bodyweight', alternates:['ex163'] },
  { id:'ex167', name:'Burpee',                      muscle:'Cardio',      movement:'cardio',equipment:'Bodyweight', alternates:['ex163'] },
  { id:'ex168', name:'Box Jump',                    muscle:'Cardio',      movement:'cardio',equipment:'Bodyweight', alternates:['ex167'] },
  { id:'ex169', name:'Assault Bike',                muscle:'Cardio',      movement:'cardio',equipment:'Machine',    alternates:['ex161'] },
  { id:'ex170', name:'Ski Erg',                     muscle:'Cardio',      movement:'cardio',equipment:'Machine',    alternates:['ex162'] },
  { id:'ex171', name:'Sled Drag',                   muscle:'Cardio',      movement:'cardio',equipment:'Machine',    alternates:['ex160'] },

  // ── Olympic / Power ────────────────────────────────────────────────────────
  { id:'ex172', name:'Power Clean',                 muscle:'Full Body',   movement:'hinge', equipment:'Barbell',    alternates:['ex021'] },
  { id:'ex173', name:'Hang Clean',                  muscle:'Full Body',   movement:'hinge', equipment:'Barbell',    alternates:['ex172'] },
  { id:'ex174', name:'Clean and Jerk',              muscle:'Full Body',   movement:'hinge', equipment:'Barbell',    alternates:['ex172'] },
  { id:'ex175', name:'Snatch',                      muscle:'Full Body',   movement:'hinge', equipment:'Barbell',    alternates:['ex172'] },
  { id:'ex176', name:'Hang Snatch',                 muscle:'Full Body',   movement:'hinge', equipment:'Barbell',    alternates:['ex175'] },
  { id:'ex177', name:'Power Snatch',                muscle:'Full Body',   movement:'hinge', equipment:'Barbell',    alternates:['ex175'] },

  // ── Full Body / Compound ───────────────────────────────────────────────────
  { id:'ex178', name:'Kettlebell Swing',            muscle:'Full Body',   movement:'hinge', equipment:'Kettlebell', alternates:['ex125','ex021'] },
  { id:'ex179', name:'Thruster',                    muscle:'Full Body',   movement:'squat', equipment:'Barbell',    alternates:['ex093','ex051'] },
  { id:'ex180', name:'Man Maker',                   muscle:'Full Body',   movement:'push',  equipment:'Dumbbell',   alternates:['ex167'] },
  { id:'ex181', name:'Turkish Get Up',              muscle:'Full Body',   movement:'core',  equipment:'Kettlebell', alternates:['ex140'] },
  { id:'ex182', name:'Farmers Walk',                muscle:'Full Body',   movement:'carry', equipment:'Dumbbell',   alternates:['ex062'] },
  { id:'ex183', name:'Sandbag Clean',               muscle:'Full Body',   movement:'hinge', equipment:'Bodyweight', alternates:['ex172'] },
  { id:'ex184', name:'Tire Flip',                   muscle:'Full Body',   movement:'hinge', equipment:'Bodyweight', alternates:['ex021'] },

  // ── Forearms ───────────────────────────────────────────────────────────────
  { id:'ex185', name:'Wrist Curl',                  muscle:'Forearms',    movement:'pull',  equipment:'Barbell',    alternates:['ex186'] },
  { id:'ex186', name:'Reverse Wrist Curl',          muscle:'Forearms',    movement:'push',  equipment:'Barbell',    alternates:['ex185'] },
  { id:'ex187', name:'Wrist Roller',                muscle:'Forearms',    movement:'pull',  equipment:'Bodyweight', alternates:['ex185'] },
  { id:'ex188', name:'Plate Pinch',                 muscle:'Forearms',    movement:'carry', equipment:'Plate',      alternates:['ex182'] },

  // ── Neck ───────────────────────────────────────────────────────────────────
  { id:'ex189', name:'Neck Curl',                   muscle:'Neck',        movement:'pull',  equipment:'Plate',      alternates:['ex190'] },
  { id:'ex190', name:'Neck Extension',              muscle:'Neck',        movement:'push',  equipment:'Plate',      alternates:['ex189'] },
  { id:'ex191', name:'Neck Lateral Flexion',        muscle:'Neck',        movement:'pull',  equipment:'Bodyweight', alternates:['ex189'] },

  // ── Stretching / Mobility ──────────────────────────────────────────────────
  { id:'ex192', name:'Hip Flexor Stretch',          muscle:'Mobility',    movement:'core',  equipment:'Bodyweight', alternates:[] },
  { id:'ex193', name:'Pigeon Pose',                 muscle:'Mobility',    movement:'core',  equipment:'Bodyweight', alternates:[] },
  { id:'ex194', name:'World Greatest Stretch',      muscle:'Mobility',    movement:'core',  equipment:'Bodyweight', alternates:[] },
  { id:'ex195', name:'Cat Cow',                     muscle:'Mobility',    movement:'core',  equipment:'Bodyweight', alternates:[] },
  { id:'ex196', name:'Thoracic Rotation',           muscle:'Mobility',    movement:'core',  equipment:'Bodyweight', alternates:[] },
  { id:'ex197', name:'Ankle Mobility Drill',        muscle:'Mobility',    movement:'core',  equipment:'Bodyweight', alternates:[] },
  { id:'ex198', name:'90 90 Hip Stretch',           muscle:'Mobility',    movement:'core',  equipment:'Bodyweight', alternates:[] },
  { id:'ex199', name:'Couch Stretch',               muscle:'Mobility',    movement:'core',  equipment:'Bodyweight', alternates:[] },
  { id:'ex200', name:'Foam Rolling',                muscle:'Mobility',    movement:'core',  equipment:'Bodyweight', alternates:[] },
]

export function getExerciseById(id) {
  return EXERCISES.find(e => e.id === id) || null
}

export function searchExercises(query, limit = 20) {
  if (!query || !query.trim()) return EXERCISES.slice(0, limit)
  const q = query.toLowerCase()
  return EXERCISES
    .filter(e =>
      e.name.toLowerCase().includes(q) ||
      e.muscle.toLowerCase().includes(q) ||
      e.equipment.toLowerCase().includes(q)
    )
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
  'All', 'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps',
  'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core',
  'Cardio', 'Full Body', 'Forearms', 'Neck', 'Mobility'
]

export const MOVEMENTS = ['push', 'pull', 'squat', 'hinge', 'core', 'cardio', 'carry']
