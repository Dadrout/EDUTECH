import { i18n } from "@/i18n/core";
import type { AnswerRecord, CurriculumEntry, Dataset, DatasetMeta } from "@/lib/domain/types";
import { parseCsvText } from "./raw-table";
import { validateCurriculum } from "./validate-curriculum";
import { validateResults } from "./validate-results";

export const DEMO_RESULTS_URL = "/demo/results.csv";
export const DEMO_CURRICULUM_URL = "/demo/curriculum.csv";

export function buildDataset(records: AnswerRecord[], curriculum: CurriculumEntry[], meta: Partial<DatasetMeta> & Pick<DatasetMeta, "name" | "source">): Dataset {
  return {
    records,
    curriculum,
    meta: {
      isSynthetic: false,
      loadedAt: new Date().toISOString(),
      resultsFileName: null,
      curriculumFileName: null,
      excludedResultRows: 0,
      excludedCurriculumRows: 0,
      removedDuplicates: 0,
      ...meta,
    },
  };
}

/**
 * Демо-набор проходит тот же конвейер разбора и проверки, что и загружаемые файлы.
 * Ошибки в демо-данных считаются дефектом и не скрываются.
 */
export function datasetFromDemoCsv(resultsCsv: string, curriculumCsv: string): Dataset {
  const results = validateResults(parseCsvText(resultsCsv, "UTF-8"));
  const plan = validateCurriculum(parseCsvText(curriculumCsv, "UTF-8"));
  const problems = [...results.fatal, ...plan.fatal];
  if (results.errorRows > 0) problems.push(i18n().t(i18n().m.validation.demoResultErrors, { n: results.errorRows }));
  if (plan.errorRows > 0) problems.push(i18n().t(i18n().m.validation.demoPlanErrors, { n: plan.errorRows }));
  if (problems.length > 0) throw new Error(i18n().t(i18n().m.validation.demoInvalid, { problems: problems.join("; ") }));
  return buildDataset(results.records, plan.entries, {
    name: "Демонстрационный набор (синтетические данные)",
    source: "demo",
    isSynthetic: true,
    resultsFileName: "results.csv",
    curriculumFileName: "curriculum.csv",
    removedDuplicates: results.duplicateRows,
  });
}

export async function fetchDemoDataset(signal?: AbortSignal): Promise<Dataset> {
  const [r, c] = await Promise.all([fetch(DEMO_RESULTS_URL, { signal }), fetch(DEMO_CURRICULUM_URL, { signal })]);
  if (!r.ok || !c.ok) throw new Error(i18n().m.validation.demoLoadFailed);
  return datasetFromDemoCsv(await r.text(), await c.text());
}
