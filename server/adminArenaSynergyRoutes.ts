import { Router, type Request, type RequestHandler, type Response } from 'express';
import {
  ARENA_CLASS_IDS,
  type ArenaDraftAdviceRequest,
  type ArenaDraftAdviceResponse,
  type ArenaClassId,
  type ArenaSynergyPayload,
} from '../shared/arenaSynergyContract.js';
import {
  ArenaDraftAdvisorInputError,
  rankArenaDraftChoices,
} from '../shared/arenaDraftAdvisor.js';

export type AdminArenaSynergyDependencies = {
  adminGuard: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  csrfAllowed: (request: Request) => boolean;
  loadAnalysis: (
    className: ArenaClassId,
    options: { forceRefresh: boolean },
  ) => Promise<ArenaSynergyPayload | unknown>;
  onError?: (error: unknown) => void;
};

export function createAdminArenaSynergyRouter(
  dependencies: AdminArenaSynergyDependencies,
): Router {
  const router = Router();
  const privateAdminResponse: RequestHandler = (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  };
  router.use('/admin/arena-synergies', dependencies.adminGuard, privateAdminResponse);
  router.use('/admin/arena-draft-advice', dependencies.adminGuard, privateAdminResponse);

  router.get('/admin/arena-synergies', async (request, response) => {
    const query = request.query.class;
    const className = query == null || query === '' ? 'ALL' : query;
    const forceRefresh = request.query.refresh === '1';
    if (
      typeof className !== 'string'
      || !ARENA_CLASS_IDS.includes(className.toUpperCase() as ArenaClassId)
    ) {
      return response.status(400).json({
        code: 'INVALID_ARENA_CLASS',
        error: 'Неизвестный класс Арены',
      });
    }

    try {
      return response.json(await dependencies.loadAnalysis(
        className.toUpperCase() as ArenaClassId,
        { forceRefresh },
      ));
    } catch (error) {
      dependencies.onError?.(error);
      return response.status(502).json({
        code: 'ARENA_SYNERGIES_UNAVAILABLE',
        error: 'Не удалось рассчитать сочетания Арены',
      });
    }
  });

  router.post('/admin/arena-draft-advice', async (request, response) => {
    if (!dependencies.csrfAllowed(request)) {
      return response.status(403).json({
        code: 'CSRF_REJECTED',
        error: 'Запрос отклонён проверкой источника',
      });
    }

    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return response.status(400).json({
        code: 'INVALID_REQUEST_BODY',
        error: 'Ожидался JSON-объект с классом, колодой и тремя кандидатами',
      });
    }
    const input = body as Record<string, unknown>;
    const className = typeof input.class === 'string' ? input.class.toUpperCase() : '';
    if (
      className === 'ALL'
      || !ARENA_CLASS_IDS.includes(className as ArenaClassId)
    ) {
      return response.status(400).json({
        code: 'INVALID_ARENA_CLASS',
        error: 'Нужен конкретный класс Арены',
      });
    }
    if (!Array.isArray(input.deckCardIds) || !Array.isArray(input.candidateCardIds)) {
      return response.status(400).json({
        code: 'INVALID_REQUEST_BODY',
        error: 'deckCardIds и candidateCardIds должны быть массивами',
      });
    }
    if (input.deckCardIds.length > 30) {
      return response.status(400).json({
        code: 'DECK_TOO_LARGE',
        error: 'В колоде Арены не может быть больше 30 карт.',
      });
    }
    if (input.candidateCardIds.length !== 3) {
      return response.status(400).json({
        code: 'INVALID_CANDIDATE_COUNT',
        error: 'Для сравнения нужны ровно три предложенные карты.',
      });
    }
    const cardIds = [...input.deckCardIds, ...input.candidateCardIds];
    if (cardIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 80)) {
      return response.status(400).json({
        code: 'INVALID_CARD_ID',
        error: 'Идентификатор карты должен содержать от 1 до 80 символов.',
      });
    }
    if (new Set(input.candidateCardIds).size !== input.candidateCardIds.length) {
      return response.status(400).json({
        code: 'DUPLICATE_CANDIDATES',
        error: 'Три предложенные карты должны быть разными.',
      });
    }

    try {
      const selectedClass = className as ArenaDraftAdviceRequest['class'];
      const payload = await dependencies.loadAnalysis(selectedClass, { forceRefresh: false });
      if (
        !payload
        || typeof payload !== 'object'
        || !('draftAdvisor' in payload)
        || !(payload as ArenaSynergyPayload).draftAdvisor
        || (payload as ArenaSynergyPayload).reliability.sampleMode === 'insufficient'
      ) {
        return response.status(409).json({
          code: 'ARENA_DRAFT_ADVISOR_NOT_READY',
          error: 'Для этого класса пока недостаточно актуальных данных',
        });
      }
      const analysis = payload as ArenaSynergyPayload;
      const advice = rankArenaDraftChoices({
        context: analysis.draftAdvisor!,
        combinations: analysis.combinations,
        deckCardIds: input.deckCardIds as string[],
        candidateCardIds: input.candidateCardIds as string[],
      });
      const { model, ...adviceResult } = advice;
      const result: ArenaDraftAdviceResponse = {
        schemaVersion: 1,
        generatedAt: analysis.generatedAt,
        selectedClass,
        model,
        cohort: analysis.cohort,
        sample: {
          runsAnalyzed: analysis.summary.runsAnalyzed,
          dataQualityStatus: analysis.dataQuality.status,
          sampleMode: analysis.reliability.sampleMode,
          servedFrom: analysis.reliability.servedFrom,
        },
        advice: adviceResult,
      };
      return response.json(result);
    } catch (error) {
      if (error instanceof ArenaDraftAdvisorInputError) {
        return response.status(400).json({
          code: error.code,
          error: error.message,
        });
      }
      dependencies.onError?.(error);
      return response.status(502).json({
        code: 'ARENA_DRAFT_ADVICE_UNAVAILABLE',
        error: 'Не удалось рассчитать рекомендацию для драфта',
      });
    }
  });

  return router;
}
