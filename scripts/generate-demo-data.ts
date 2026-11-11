/**
 * Генератор СИНТЕТИЧЕСКОГО демонстрационного набора данных.
 *
 * Данные не относятся к реальным ученикам, школам или издательствам.
 * Генерация детерминирована (фиксированный seed): повторный запуск
 * даёт байт-в-байт одинаковые файлы.
 *
 * Модель ответа (логистическая, как в IRT):
 *   P(верно) = σ(способность ученика + эффект класса + лёгкость темы
 *                + эффект учебника на тему − трудность задания)
 *
 * В набор намеренно заложены сценарии для демонстрации платформы:
 *  - сложные темы (низкая успешность) в каждой параллели;
 *  - «Алгебра 7»: учебник «Гамма» используется только в слабом классе 7Г —
 *    различие смешано с эффектом класса (платформа должна это показать);
 *  - «Алгебра 7», тема «Алгебраические дроби»: 7Г писал другой вариант
 *    теста (3 общих задания из 6) — сравнение только по общим заданиям;
 *  - «Алгебра 8»: УМК «Бета» даёт устойчивое преимущество в двух классах;
 *  - «Алгебра 9»: реальной разницы между учебниками нет;
 *  - «Физика 8», «Электромагнитные явления»: 8Г писал полностью другой
 *    вариант — тема несопоставима;
 *  - «Физика 9», «Ядерная физика»: тест писали лишь 8 учеников — мало данных.
 *
 * Запуск: npm run generate:demo
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ERROR_TYPES, type KnownErrorType } from "../src/lib/analytics/skills";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "demo");
const SEED = 20261111;
const STUDENTS_PER_CLASS = 25;
const QUESTIONS_PER_TOPIC = 6;
const ABSENCE_RATE = 0.06;

// ---------- Детерминированный ГПСЧ ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
function normal(mean = 0, sd = 1): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const logit = (p: number) => Math.log(p / (1 - p));
// Поправка на разброс способностей: средняя успешность ближе к 50%, чем σ(лёгкости).
const easeFor = (targetPct: number) => logit(targetPct / 100) * 1.17;

// ---------- Структура школы ----------
const GRADES = [7, 8, 9] as const;
const LETTERS = ["А", "Б", "В", "Г"] as const;

interface TopicDef {
  id: string;
  name: string;
  target: number;
  hours: number;
  min: number;
}

interface CourseDef {
  subject: string;
  code: string;
  grade: number;
  topics: TopicDef[];
  textbooks: { id: string; name: string; classes: string[] }[];
  /** Эффект учебника: textbookId → (topicId | "*") → логит-сдвиг. */
  textbookEffects: Record<string, Record<string, number>>;
  /** Эффект класса (учитель, подготовка) по предмету. */
  classEffects: Record<string, number>;
  testDates: string[];
}

const t = (id: string, name: string, target: number, hours: number, min: number): TopicDef => ({ id, name, target, hours, min });

const COURSES: CourseDef[] = [
  {
    subject: "Алгебра",
    code: "ALG",
    grade: 7,
    topics: [
      t("ALG7-01", "Степень с натуральным показателем", 85, 10, 7),
      t("ALG7-02", "Одночлены", 82, 10, 7),
      t("ALG7-03", "Многочлены", 72, 14, 10),
      t("ALG7-04", "Формулы сокращённого умножения", 59, 14, 10),
      t("ALG7-05", "Разложение многочленов на множители", 47, 14, 10),
      t("ALG7-06", "Алгебраические дроби", 42, 14, 10),
      t("ALG7-07", "Линейная функция и её график", 70, 13, 9),
      t("ALG7-08", "Системы линейных уравнений", 64, 13, 9),
    ],
    textbooks: [
      { id: "ALG7-ALPHA", name: "Алгебра 7 · УМК «Альфа»", classes: ["7А", "7Б"] },
      { id: "ALG7-BETA", name: "Алгебра 7 · УМК «Бета»", classes: ["7В"] },
      { id: "ALG7-GAMMA", name: "Алгебра 7 · УМК «Гамма»", classes: ["7Г"] },
    ],
    textbookEffects: { "ALG7-BETA": { "ALG7-04": 0.5, "ALG7-06": -0.2 }, "ALG7-GAMMA": { "ALG7-05": 0.2 } },
    classEffects: { "7А": 0.1, "7Б": -0.05, "7В": 0.05, "7Г": -0.6 },
    testDates: ["2025-10-16", "2025-12-11", "2026-02-12", "2026-04-16"],
  },
  {
    subject: "Алгебра",
    code: "ALG",
    grade: 8,
    topics: [
      t("ALG8-01", "Квадратные корни", 77, 14, 10),
      t("ALG8-02", "Свойства арифметического квадратного корня", 66, 12, 8),
      t("ALG8-03", "Квадратные уравнения", 74, 18, 13),
      t("ALG8-04", "Теорема Виета", 84, 10, 7),
      t("ALG8-05", "Квадратичная функция", 50, 18, 13),
      t("ALG8-06", "Квадратные неравенства", 47, 16, 11),
      t("ALG8-07", "Элементы теории вероятностей", 88, 14, 10),
    ],
    textbooks: [
      { id: "ALG8-ALPHA", name: "Алгебра 8 · УМК «Альфа»", classes: ["8А", "8Б"] },
      { id: "ALG8-BETA", name: "Алгебра 8 · УМК «Бета»", classes: ["8В", "8Г"] },
    ],
    textbookEffects: { "ALG8-BETA": { "*": 0.4, "ALG8-05": 0.7, "ALG8-06": 0.6 } },
    classEffects: { "8А": 0.0, "8Б": 0.06, "8В": -0.15, "8Г": 0.12 },
    testDates: ["2025-10-23", "2025-12-18", "2026-03-05", "2026-05-14"],
  },
  {
    subject: "Алгебра",
    code: "ALG",
    grade: 9,
    topics: [
      t("ALG9-01", "Неравенства и системы неравенств", 71, 16, 11),
      t("ALG9-02", "Числовые последовательности", 83, 10, 7),
      t("ALG9-03", "Арифметическая прогрессия", 80, 14, 10),
      t("ALG9-04", "Геометрическая прогрессия", 65, 14, 10),
      t("ALG9-05", "Элементы комбинаторики", 56, 14, 10),
      t("ALG9-06", "Тригонометрические выражения", 39, 18, 13),
      t("ALG9-07", "Функции и их свойства", 68, 16, 11),
    ],
    textbooks: [
      { id: "ALG9-ALPHA", name: "Алгебра 9 · УМК «Альфа»", classes: ["9А", "9Б"] },
      { id: "ALG9-GAMMA", name: "Алгебра 9 · УМК «Гамма»", classes: ["9В", "9Г"] },
    ],
    textbookEffects: {},
    classEffects: { "9А": 0.12, "9Б": -0.1, "9В": 0.0, "9Г": 0.04 },
    testDates: ["2025-10-09", "2025-12-04", "2026-02-26", "2026-04-23"],
  },
  {
    subject: "Физика",
    code: "PHY",
    grade: 7,
    topics: [
      t("PHY7-01", "Физические величины и измерения", 86, 6, 4),
      t("PHY7-02", "Строение вещества", 81, 6, 4),
      t("PHY7-03", "Механическое движение", 70, 10, 7),
      t("PHY7-04", "Плотность вещества", 58, 8, 6),
      t("PHY7-05", "Сила и виды сил", 66, 10, 7),
      t("PHY7-06", "Давление твёрдых тел, жидкостей и газов", 47, 12, 8),
      t("PHY7-07", "Работа и мощность", 62, 8, 6),
      t("PHY7-08", "Простые механизмы", 74, 8, 6),
    ],
    textbooks: [
      { id: "PHY7-VECTOR", name: "Физика 7 · УМК «Вектор»", classes: ["7А", "7В"] },
      { id: "PHY7-IMPULSE", name: "Физика 7 · УМК «Импульс»", classes: ["7Б", "7Г"] },
    ],
    textbookEffects: { "PHY7-IMPULSE": { "*": 0.08 } },
    classEffects: { "7А": 0.05, "7Б": 0.0, "7В": 0.02, "7Г": -0.12 },
    testDates: ["2025-10-21", "2025-12-16", "2026-03-03", "2026-05-12"],
  },
  {
    subject: "Физика",
    code: "PHY",
    grade: 8,
    topics: [
      t("PHY8-01", "Тепловые явления", 78, 10, 7),
      t("PHY8-02", "Изменение агрегатных состояний вещества", 73, 8, 6),
      t("PHY8-03", "Электрические заряды", 67, 8, 6),
      t("PHY8-04", "Постоянный электрический ток", 60, 12, 8),
      t("PHY8-05", "Закон Ома для участка цепи", 51, 12, 8),
      t("PHY8-06", "Электромагнитные явления", 61, 9, 6),
      t("PHY8-07", "Световые явления", 84, 9, 6),
    ],
    textbooks: [
      { id: "PHY8-VECTOR", name: "Физика 8 · УМК «Вектор»", classes: ["8А", "8Б", "8В"] },
      { id: "PHY8-IMPULSE", name: "Физика 8 · УМК «Импульс»", classes: ["8Г"] },
    ],
    textbookEffects: { "PHY8-IMPULSE": { "*": 0.2 } },
    classEffects: { "8А": 0.0, "8Б": 0.06, "8В": -0.05, "8Г": 0.05 },
    testDates: ["2025-10-28", "2025-12-23", "2026-03-10", "2026-05-19"],
  },
  {
    subject: "Физика",
    code: "PHY",
    grade: 9,
    topics: [
      t("PHY9-01", "Кинематика", 63, 12, 8),
      t("PHY9-02", "Законы Ньютона", 67, 10, 7),
      t("PHY9-03", "Законы сохранения", 55, 12, 8),
      t("PHY9-04", "Механические колебания и волны", 72, 10, 7),
      t("PHY9-05", "Электромагнитное поле", 58, 10, 7),
      t("PHY9-06", "Строение атома", 80, 8, 6),
      t("PHY9-07", "Ядерная физика", 70, 6, 4),
    ],
    textbooks: [
      { id: "PHY9-VECTOR", name: "Физика 9 · УМК «Вектор»", classes: ["9А", "9Б"] },
      { id: "PHY9-IMPULSE", name: "Физика 9 · УМК «Импульс»", classes: ["9В", "9Г"] },
    ],
    textbookEffects: { "PHY9-IMPULSE": { "PHY9-03": -0.3, "PHY9-05": -0.3 } },
    classEffects: { "9А": 0.08, "9Б": -0.04, "9В": 0.0, "9Г": -0.02 },
    testDates: ["2025-10-14", "2025-12-09", "2026-02-24", "2026-05-05"],
  },
];

// Названия идут от базовых операций к составным задачам.
const TOPIC_SKILLS: Record<string, [string, string, string]> = {
  "ALG7-01": ["Вычисление степеней", "Умножение и деление степеней", "Возведение степени в степень"],
  "ALG7-02": ["Стандартный вид одночлена", "Умножение одночленов", "Возведение одночлена в степень"],
  "ALG7-03": ["Приведение подобных слагаемых", "Сложение многочленов", "Умножение многочленов"],
  "ALG7-04": ["Квадрат суммы", "Квадрат разности", "Разность квадратов"],
  "ALG7-05": ["Вынесение общего множителя", "Метод группировки", "Разложение по формулам"],
  "ALG7-06": ["Сокращение дробей", "Приведение к общему знаменателю", "Сложение и вычитание дробей"],
  "ALG7-07": ["Вычисление значения функции", "Построение прямой", "Определение коэффициентов по графику"],
  "ALG7-08": ["Проверка решения системы", "Метод подстановки", "Метод сложения"],
  "ALG8-01": ["Извлечение квадратного корня", "Оценка значения корня", "Сравнение иррациональных чисел"],
  "ALG8-02": ["Корень произведения", "Вынесение множителя из-под корня", "Преобразование выражений с корнями"],
  "ALG8-03": ["Неполные квадратные уравнения", "Вычисление дискриминанта", "Нахождение корней уравнения"],
  "ALG8-04": ["Сумма и произведение корней", "Подбор корней по Виету", "Составление уравнения по корням"],
  "ALG8-05": ["Вершина параболы", "Построение параболы", "Анализ квадратичной функции"],
  "ALG8-06": ["Нули квадратного трёхчлена", "Метод интервалов", "Запись решения неравенства"],
  "ALG8-07": ["Подсчёт исходов", "Вычисление вероятности", "Вероятность противоположного события"],
  "ALG9-01": ["Решение линейных неравенств", "Пересечение промежутков", "Решение систем неравенств"],
  "ALG9-02": ["Вычисление членов последовательности", "Определение закономерности", "Рекуррентное задание последовательности"],
  "ALG9-03": ["Разность прогрессии", "Общий член арифметической прогрессии", "Сумма арифметической прогрессии"],
  "ALG9-04": ["Знаменатель прогрессии", "Общий член геометрической прогрессии", "Сумма геометрической прогрессии"],
  "ALG9-05": ["Правило произведения", "Перестановки и размещения", "Вычисление сочетаний"],
  "ALG9-06": ["Значения тригонометрических функций", "Применение основного тождества", "Преобразование тригонометрических выражений"],
  "ALG9-07": ["Область определения функции", "Чётность функции", "Промежутки монотонности"],
  "PHY7-01": ["Чтение шкалы прибора", "Перевод единиц измерения", "Оценка погрешности измерений"],
  "PHY7-02": ["Молекулярное строение вещества", "Объяснение диффузии", "Сравнение агрегатных состояний"],
  "PHY7-03": ["Определение пути и времени", "Расчёт скорости", "Чтение графиков движения"],
  "PHY7-04": ["Определение объёма тела", "Вычисление плотности", "Нахождение массы по плотности"],
  "PHY7-05": ["Определение видов сил", "Расчёт силы тяжести", "Нахождение равнодействующей"],
  "PHY7-06": ["Давление твёрдого тела", "Гидростатическое давление", "Применение закона Паскаля"],
  "PHY7-07": ["Вычисление работы", "Вычисление мощности", "Связь работы и времени"],
  "PHY7-08": ["Условие равновесия рычага", "Выигрыш в силе", "Расчёт КПД механизма"],
  "PHY8-01": ["Способы теплопередачи", "Расчёт количества теплоты", "Уравнение теплового баланса"],
  "PHY8-02": ["Чтение графика нагревания", "Расчёт теплоты плавления", "Расчёт теплоты парообразования"],
  "PHY8-03": ["Взаимодействие зарядов", "Объяснение электризации", "Закон сохранения заряда"],
  "PHY8-04": ["Определение силы тока", "Измерение напряжения", "Чтение электрических схем"],
  "PHY8-05": ["Расчёт сопротивления", "Применение закона Ома", "Расчёт участка цепи"],
  "PHY8-06": ["Магнитное поле тока", "Действие магнита на проводник", "Электромагнитная индукция"],
  "PHY8-07": ["Закон отражения света", "Преломление света", "Построение изображения в линзе"],
  "PHY9-01": ["Определение ускорения", "Расчёт перемещения", "Анализ графиков скорости"],
  "PHY9-02": ["Инерция и первый закон Ньютона", "Применение второго закона Ньютона", "Взаимодействие тел"],
  "PHY9-03": ["Расчёт импульса", "Закон сохранения импульса", "Закон сохранения энергии"],
  "PHY9-04": ["Период и частота колебаний", "Расчёт длины волны", "Анализ колебательного движения"],
  "PHY9-05": ["Свойства электромагнитного поля", "Определение направления сил", "Свойства электромагнитных волн"],
  "PHY9-06": ["Модель атома", "Определение состава атома", "Объяснение атомных спектров"],
  "PHY9-07": ["Состав атомного ядра", "Виды радиоактивного распада", "Запись ядерных реакций"],
};

/** Тема и класс, для которых класс писал другой вариант теста. */
const VARIANTS: { topicId: string; classId: string; shared: number }[] = [
  { topicId: "ALG7-06", classId: "7Г", shared: 3 },
  { topicId: "PHY8-06", classId: "8Г", shared: 0 },
];
/** Тема, которую писали только несколько учеников одного класса. */
const SPARSE = { topicId: "PHY9-07", classId: "9А", students: 8 };

// ---------- Ученики ----------
interface Student {
  id: string;
  classId: string;
  grade: number;
  ability: number;
}
const students: Student[] = [];
let counter = 0;
for (const grade of GRADES) {
  for (const letter of LETTERS) {
    for (let i = 0; i < STUDENTS_PER_CLASS; i++) {
      counter += 1;
      students.push({ id: `S${String(counter).padStart(4, "0")}`, classId: `${grade}${letter}`, grade, ability: normal(0, 0.9) });
    }
  }
}

// ---------- Генерация ответов ----------
const header = ["student_id", "class_id", "grade", "subject", "topic_id", "topic_name", "textbook_id", "textbook_name", "test_id", "question_id", "is_correct", "test_date"];
const rows: string[][] = [];
const metadataQuestions = new Map<string, Map<string, number>>();
const csvCell = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

for (const course of COURSES) {
  const courseStudents = students.filter((s) => s.grade === course.grade);
  const tbOfClass = new Map<string, { id: string; name: string }>();
  for (const tb of course.textbooks) for (const c of tb.classes) tbOfClass.set(c, tb);

  // Темы по тестам: по две темы на тест, в порядке программы.
  const testCount = course.testDates.length;
  const perTest = Math.ceil(course.topics.length / testCount);
  // Трудность заданий фиксирована для задания, а не для ученика.
  const qDifficulty = new Map<string, number>();
  const classDay = new Map<string, number>();
  for (const letter of LETTERS) classDay.set(`${course.grade}${letter}`, Math.floor(rand() * 5));

  for (let ti = 0; ti < testCount; ti++) {
    const testTopics = course.topics.slice(ti * perTest, (ti + 1) * perTest);
    if (testTopics.length === 0) continue;
    const testId = `${course.code}${course.grade}-T${ti + 1}`;
    const absent = new Set(courseStudents.filter(() => rand() < ABSENCE_RATE).map((s) => s.id));

    for (const s of courseStudents) {
      if (absent.has(s.id)) continue;
      const tb = tbOfClass.get(s.classId)!;
      const date = shiftDate(course.testDates[ti], classDay.get(s.classId) ?? 0);
      testTopics.forEach((topic, offset) => {
        if (topic.id === SPARSE.topicId) {
          const sparseIds = courseStudents.filter((x) => x.classId === SPARSE.classId).slice(0, SPARSE.students).map((x) => x.id);
          if (!sparseIds.includes(s.id)) return;
        }
        const variant = VARIANTS.find((v) => v.topicId === topic.id && v.classId === s.classId);
        const effects = course.textbookEffects[tb.id] ?? {};
        const tbEffect = (effects["*"] ?? 0) + (effects[topic.id] ?? 0);
        const base = s.ability + (course.classEffects[s.classId] ?? 0) + easeFor(topic.target) + tbEffect;
        for (let q = 0; q < QUESTIONS_PER_TOPIC; q++) {
          const n = offset * QUESTIONS_PER_TOPIC + q + 1;
          let questionId = `Q${String(n).padStart(2, "0")}`;
          let qTest = testId;
          if (variant && q >= variant.shared) {
            // Другой вариант: свои задания (и свой код теста, если общих заданий нет).
            questionId = `V${String(n).padStart(2, "0")}`;
            if (variant.shared === 0) qTest = `${testId}-B`;
          }
          const qKey = `${qTest}/${questionId}`;
          if (!qDifficulty.has(qKey)) qDifficulty.set(qKey, normal(0, 0.35) + (questionId.startsWith("V") ? 0.15 : 0));
          const groupKey = `${topic.id}/${qTest}`;
          let group = metadataQuestions.get(groupKey);
          if (!group) {
            group = new Map();
            metadataQuestions.set(groupKey, group);
          }
          group.set(questionId, qDifficulty.get(qKey)!);
          const p = sigmoid(base - qDifficulty.get(qKey)!);
          const correct = rand() < p;
          rows.push([s.id, s.classId, String(s.grade), course.subject, topic.id, topic.name, tb.id, tb.name, qTest, questionId, correct ? "1" : "0", date]);
        }
      });
    }
  }
}

// Отдельный поток не меняет исходную последовательность ответов и пропусков.
const errorRand = mulberry32(20261112);
const skillOfQuestion = new Map<string, { name: string; index: number }>();
for (const [groupKey, questions] of metadataQuestions) {
  const topicId = groupKey.split("/")[0];
  const sorted = [...questions].sort(([a, ad], [b, bd]) => ad - bd || a.localeCompare(b));
  sorted.forEach(([questionId], rank) => {
    const index = Math.floor(rank * 3 / sorted.length);
    skillOfQuestion.set(`${groupKey}/${questionId}`, { name: TOPIC_SKILLS[topicId][index], index });
  });
}
// Веса соответствуют ERROR_TYPES: у каждого навыка своя ведущая категория.
function drawError(physics: boolean, skillIndex: number): string {
  if (errorRand() < 0.05) return "";
  const weights: Record<KnownErrorType, number> = {
    calculation: 3, sign: physics ? 1 : 3, concept: 2, procedure: 2,
    formula: 2, units: physics ? 3 : 0, reading: 1, no_answer: 1,
  };
  weights[(["calculation", "procedure", "concept"] as const)[skillIndex]] += 9;
  let draw = errorRand() * ERROR_TYPES.reduce((sum, code) => sum + weights[code], 0);
  for (const code of ERROR_TYPES) {
    draw -= weights[code];
    if (draw < 0) return code;
  }
  return "no_answer";
}
header.push("skill", "error_type");
for (const row of rows) {
  const skill = skillOfQuestion.get(`${row[4]}/${row[8]}/${row[9]}`)!;
  row.push(skill.name, row[10] === "1" ? "" : drawError(row[3] === "Физика", skill.index));
}

const curriculumHeader = ["subject", "grade", "topic_id", "topic_name", "current_hours", "min_hours"];
const curriculumRows = COURSES.flatMap((c) => c.topics.map((tp) => [c.subject, String(c.grade), tp.id, tp.name, String(tp.hours), String(tp.min)]));

mkdirSync(OUT_DIR, { recursive: true });
const toCsv = (h: string[], r: string[][]) => [h, ...r].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
writeFileSync(join(OUT_DIR, "results.csv"), toCsv(header, rows), "utf8");
writeFileSync(join(OUT_DIR, "curriculum.csv"), toCsv(curriculumHeader, curriculumRows), "utf8");

for (const c of COURSES) {
  const total = c.topics.reduce((s, tp) => s + tp.hours, 0);
  console.log(`${c.subject} ${c.grade}: ${c.topics.length} тем, ${total} ч`);
}
console.log(`Учеников: ${students.length}, ответов: ${rows.length}`);
