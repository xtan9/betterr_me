-- =============================================================================
-- SEED PRESET EXERCISES
-- ~100 common exercises covering all major muscle groups and exercise types.
-- All preset exercises have user_id = NULL and is_custom = false.
-- =============================================================================
--
-- Valid exercise_type values:
--   weight_reps, bodyweight_reps, weighted_bodyweight, assisted_bodyweight,
--   duration, duration_weight, distance_duration, weight_distance
--
-- Valid equipment values:
--   barbell, dumbbell, machine, bodyweight, kettlebell, cable, band, other, none
--
-- Valid muscle_group_primary values:
--   chest, back, shoulders, biceps, triceps, forearms, core, quadriceps,
--   hamstrings, glutes, calves, traps, lats, full_body, cardio, other
-- =============================================================================

INSERT INTO exercises (name, muscle_group_primary, muscle_groups_secondary, equipment, exercise_type, is_custom) VALUES

-- =============================================================================
-- CHEST (10 exercises)
-- =============================================================================
('Barbell Bench Press', 'chest', '{triceps,shoulders}', 'barbell', 'weight_reps', false),
('Incline Barbell Bench Press', 'chest', '{triceps,shoulders}', 'barbell', 'weight_reps', false),
('Decline Barbell Bench Press', 'chest', '{triceps}', 'barbell', 'weight_reps', false),
('Dumbbell Bench Press', 'chest', '{triceps,shoulders}', 'dumbbell', 'weight_reps', false),
('Incline Dumbbell Press', 'chest', '{triceps,shoulders}', 'dumbbell', 'weight_reps', false),
('Dumbbell Fly', 'chest', '{}', 'dumbbell', 'weight_reps', false),
('Cable Crossover', 'chest', '{}', 'cable', 'weight_reps', false),
('Machine Chest Press', 'chest', '{triceps,shoulders}', 'machine', 'weight_reps', false),
('Push-up', 'chest', '{triceps,shoulders,core}', 'bodyweight', 'bodyweight_reps', false),
('Dip', 'chest', '{triceps,shoulders}', 'bodyweight', 'bodyweight_reps', false),

-- =============================================================================
-- BACK (10 exercises)
-- =============================================================================
('Deadlift', 'back', '{hamstrings,glutes,core,forearms}', 'barbell', 'weight_reps', false),
('Barbell Row', 'back', '{biceps,forearms}', 'barbell', 'weight_reps', false),
('Dumbbell Row', 'back', '{biceps,forearms}', 'dumbbell', 'weight_reps', false),
('T-Bar Row', 'back', '{biceps}', 'barbell', 'weight_reps', false),
('Seated Cable Row', 'back', '{biceps}', 'cable', 'weight_reps', false),
('Pull-up', 'back', '{biceps,forearms}', 'bodyweight', 'bodyweight_reps', false),
('Chin-up', 'back', '{biceps}', 'bodyweight', 'bodyweight_reps', false),
('Machine Row', 'back', '{biceps}', 'machine', 'weight_reps', false),
('Face Pull', 'back', '{shoulders}', 'cable', 'weight_reps', false),
('Rack Pull', 'back', '{glutes,forearms}', 'barbell', 'weight_reps', false),

-- =============================================================================
-- SHOULDERS (8 exercises)
-- =============================================================================
('Overhead Press', 'shoulders', '{triceps}', 'barbell', 'weight_reps', false),
('Dumbbell Shoulder Press', 'shoulders', '{triceps}', 'dumbbell', 'weight_reps', false),
('Lateral Raise', 'shoulders', '{}', 'dumbbell', 'weight_reps', false),
('Front Raise', 'shoulders', '{}', 'dumbbell', 'weight_reps', false),
('Reverse Fly', 'shoulders', '{back}', 'dumbbell', 'weight_reps', false),
('Arnold Press', 'shoulders', '{triceps}', 'dumbbell', 'weight_reps', false),
('Cable Lateral Raise', 'shoulders', '{}', 'cable', 'weight_reps', false),
('Machine Shoulder Press', 'shoulders', '{triceps}', 'machine', 'weight_reps', false),

-- =============================================================================
-- BICEPS (5 exercises)
-- =============================================================================
('Barbell Curl', 'biceps', '{forearms}', 'barbell', 'weight_reps', false),
('Dumbbell Curl', 'biceps', '{forearms}', 'dumbbell', 'weight_reps', false),
('Hammer Curl', 'biceps', '{forearms}', 'dumbbell', 'weight_reps', false),
('Preacher Curl', 'biceps', '{}', 'barbell', 'weight_reps', false),
('Cable Curl', 'biceps', '{}', 'cable', 'weight_reps', false),

-- =============================================================================
-- TRICEPS (5 exercises)
-- =============================================================================
('Tricep Pushdown', 'triceps', '{}', 'cable', 'weight_reps', false),
('Skull Crusher', 'triceps', '{}', 'barbell', 'weight_reps', false),
('Overhead Tricep Extension', 'triceps', '{}', 'dumbbell', 'weight_reps', false),
('Tricep Dip', 'triceps', '{chest,shoulders}', 'bodyweight', 'bodyweight_reps', false),
('Close Grip Bench Press', 'triceps', '{chest}', 'barbell', 'weight_reps', false),

-- =============================================================================
-- FOREARMS (3 exercises)
-- =============================================================================
('Wrist Curl', 'forearms', '{}', 'barbell', 'weight_reps', false),
('Reverse Wrist Curl', 'forearms', '{}', 'barbell', 'weight_reps', false),
('Farmer''s Walk', 'forearms', '{traps,core}', 'dumbbell', 'weight_distance', false),

-- =============================================================================
-- CORE (8 exercises)
-- =============================================================================
('Plank', 'core', '{}', 'bodyweight', 'duration', false),
('Side Plank', 'core', '{}', 'bodyweight', 'duration', false),
('Crunch', 'core', '{}', 'bodyweight', 'bodyweight_reps', false),
('Hanging Leg Raise', 'core', '{}', 'bodyweight', 'bodyweight_reps', false),
('Russian Twist', 'core', '{}', 'bodyweight', 'bodyweight_reps', false),
('Ab Rollout', 'core', '{}', 'other', 'bodyweight_reps', false),
('Cable Woodchop', 'core', '{shoulders}', 'cable', 'weight_reps', false),
('Dead Bug', 'core', '{}', 'bodyweight', 'bodyweight_reps', false),

-- =============================================================================
-- QUADRICEPS (8 exercises)
-- =============================================================================
('Barbell Squat', 'quadriceps', '{glutes,hamstrings,core}', 'barbell', 'weight_reps', false),
('Front Squat', 'quadriceps', '{core,glutes}', 'barbell', 'weight_reps', false),
('Leg Press', 'quadriceps', '{glutes}', 'machine', 'weight_reps', false),
('Leg Extension', 'quadriceps', '{}', 'machine', 'weight_reps', false),
('Bulgarian Split Squat', 'quadriceps', '{glutes}', 'dumbbell', 'weight_reps', false),
('Goblet Squat', 'quadriceps', '{glutes,core}', 'kettlebell', 'weight_reps', false),
('Hack Squat', 'quadriceps', '{glutes}', 'machine', 'weight_reps', false),
('Bodyweight Squat', 'quadriceps', '{glutes}', 'bodyweight', 'bodyweight_reps', false),

-- =============================================================================
-- HAMSTRINGS (5 exercises)
-- =============================================================================
('Romanian Deadlift', 'hamstrings', '{glutes,back}', 'barbell', 'weight_reps', false),
('Lying Leg Curl', 'hamstrings', '{}', 'machine', 'weight_reps', false),
('Seated Leg Curl', 'hamstrings', '{}', 'machine', 'weight_reps', false),
('Stiff-Leg Deadlift', 'hamstrings', '{glutes,back}', 'barbell', 'weight_reps', false),
('Nordic Hamstring Curl', 'hamstrings', '{}', 'bodyweight', 'bodyweight_reps', false),

-- =============================================================================
-- GLUTES (5 exercises)
-- =============================================================================
('Hip Thrust', 'glutes', '{hamstrings}', 'barbell', 'weight_reps', false),
('Glute Bridge', 'glutes', '{hamstrings}', 'bodyweight', 'bodyweight_reps', false),
('Cable Pull Through', 'glutes', '{hamstrings}', 'cable', 'weight_reps', false),
('Kettlebell Swing', 'glutes', '{hamstrings,core}', 'kettlebell', 'weight_reps', false),
('Sumo Deadlift', 'glutes', '{quadriceps,back}', 'barbell', 'weight_reps', false),

-- =============================================================================
-- CALVES (4 exercises)
-- =============================================================================
('Standing Calf Raise', 'calves', '{}', 'machine', 'weight_reps', false),
('Seated Calf Raise', 'calves', '{}', 'machine', 'weight_reps', false),
('Bodyweight Calf Raise', 'calves', '{}', 'bodyweight', 'bodyweight_reps', false),
('Donkey Calf Raise', 'calves', '{}', 'machine', 'weight_reps', false),

-- =============================================================================
-- TRAPS (3 exercises)
-- =============================================================================
('Barbell Shrug', 'traps', '{}', 'barbell', 'weight_reps', false),
('Dumbbell Shrug', 'traps', '{}', 'dumbbell', 'weight_reps', false),
('Upright Row', 'traps', '{shoulders}', 'barbell', 'weight_reps', false),

-- =============================================================================
-- LATS (4 exercises)
-- =============================================================================
('Lat Pulldown', 'lats', '{biceps}', 'cable', 'weight_reps', false),
('Close Grip Lat Pulldown', 'lats', '{biceps}', 'cable', 'weight_reps', false),
('Straight Arm Pulldown', 'lats', '{}', 'cable', 'weight_reps', false),
('Single Arm Lat Pulldown', 'lats', '{biceps}', 'cable', 'weight_reps', false),

-- =============================================================================
-- FULL BODY (4 exercises)
-- =============================================================================
('Burpee', 'full_body', '{chest,core,quadriceps}', 'bodyweight', 'bodyweight_reps', false),
('Clean and Press', 'full_body', '{shoulders,quadriceps,back}', 'barbell', 'weight_reps', false),
('Thruster', 'full_body', '{shoulders,quadriceps}', 'barbell', 'weight_reps', false),
('Man Maker', 'full_body', '{chest,shoulders,back}', 'dumbbell', 'weight_reps', false),

-- =============================================================================
-- CARDIO (10 exercises)
-- =============================================================================
('Treadmill Running', 'cardio', '{}', 'machine', 'distance_duration', false),
('Rowing Machine', 'cardio', '{back,core}', 'machine', 'distance_duration', false),
('Stationary Bike', 'cardio', '{quadriceps}', 'machine', 'distance_duration', false),
('Elliptical', 'cardio', '{}', 'machine', 'distance_duration', false),
('Jump Rope', 'cardio', '{calves}', 'other', 'duration', false),
('Jumping Jack', 'cardio', '{}', 'bodyweight', 'bodyweight_reps', false),
('Mountain Climber', 'cardio', '{core}', 'bodyweight', 'duration', false),
('Battle Ropes', 'cardio', '{shoulders,core}', 'other', 'duration', false),
('Stair Climber', 'cardio', '{quadriceps,glutes}', 'machine', 'duration', false),
('Box Jump', 'cardio', '{quadriceps,glutes}', 'other', 'bodyweight_reps', false);
