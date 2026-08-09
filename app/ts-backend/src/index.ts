import { healthCheck } from "ts-db";
import { timingSafeEqual } from "node:crypto";
import { env, db } from "./db";
import {
  addCurriculumToStudent,
  completeStudentProfilePhotoUpload,
  createAccountInvitation,
  discardStudentProfilePhotoUpload,
  ensureParentProfile,
  getLocalDevUserByEmail,
  listAccountPeople,
  hasParentAccountForEmail,
  getStudentCurriculumManagement,
  listProfilesForUser,
  prepareStudentProfilePhotoUpload,
  removeCurriculumFromStudent,
  syncStudentVocabularyToAge,
  updateOwnAccountName,
  updateAccountMemberRole,
  updateStudentGradingScheme,
  updateStudentLearningProfile
} from "./services/accounts";
import {
  createManualAttendanceEntry,
  deleteAttendanceEntry,
  getStudentAttendance,
  recordPlanDayAttendance,
  recordPlanItemAttendance,
  setPlanDaySubjectCompletion,
  updateManualAttendanceEntry
} from "./services/attendance";
import {
  completePublicCoreSubscriptionCheckout,
  createCoreSubscriptionCheckout,
  createPublicCoreSubscriptionCheckout,
  createPlanPackCheckout,
  createCustomerPortalSession,
  createMembershipPlanChangeSession,
  createStudentProfileWithBilling,
  decideFunnelOneClickOffer,
  decideFirstGradePostCheckoutOffer,
  getFirstGradePostCheckoutOffer,
  getPlanGeneratorPricing,
  getBillingOverview,
  handleStripeWebhook,
  listElectiveCatalog
} from "./services/billing";
import {
  getCurriculumTreeBySubjectSlug,
  getNodeBySlug,
  getStudentCurriculumPath,
  listCurriculumPrograms,
  listCurriculumSubjectsByProgram,
  listCurriculumSubjects
} from "./services/curriculum";
import {
  buildLessonPrompt,
  getStudentClassroomData,
  getLessonById,
  getLessonContext,
  getOrCreateLessonForNode,
  getOrCreateNextLessonForSubject,
  listLessonsForProfile,
  markLessonSlideCompleted,
  submitLessonQuiz
} from "./services/lessons";
import { getStudentGrades } from "./services/grades";
import { getStudentOverviewMetrics } from "./services/student-overview";
import { getTeacherActivity } from "./services/teacher-activity";
import { getPremiumFeatureAccess, requirePremiumFeatureAccess } from "./services/entitlements";
import { getLocaleAssets } from "./services/locales";
import { runMaintenanceJob } from "./services/maintenance";
import { triggerProcessorJob } from "./services/cloud-run-jobs";
import { evaluateSession, unlockInitialSkill } from "./services/mastery";
import {
  buildWeeklyPacket,
  buildWeeklyPacketDayArchive,
  buildLessonPreview,
  classifyPaperPlanUpload,
  createLearningYear,
  deleteContentDocument,
  evaluateLearningYearCurriculumCompleteness,
  getPaperPlan,
  getWeeklyPlanManifest,
  getWeeklyPlanQrDestination,
  beginWeeklyPlanDownload,
  completeWeeklyPlanDownload,
  discardWeeklyPlanDownload,
  startLearningYearPlanning,
  retryFailedLearningYearPlanning,
  retryFailedPlanPackJobs,
  restorePreviousPlanVersion,
  setLessonDisposition,
  setWeeklyPlanPracticeCompression,
  setWeeklyPlanDaySubjectGrade,
  updateLearningYearDetails,
  updateContentDocumentMetadata,
  uploadContentDocument
} from "./services/paper-plans";
import {
  buildPlanPackWeeklyPacket,
  attachPlanPackNativeWorkbook,
  completePlanPackIntake,
  completePlanPackStagedUploads,
  createPlanPackCheckoutForIntake,
  createPlanPackIntake,
  evaluatePlanPackCurriculum,
  approvePlanPackCurriculum,
  getPlanPackIntakeStatus,
  markPlanPackIntakeFailed,
  preparePlanPackUploadUrls,
  setPlanPackWeeklyPracticeCompression
} from "./services/plan-pack-intake";
import {
  getStudentStreakSettings,
  getStreakStatus,
  recordActivity,
  updateStudentStreakSettings
} from "./services/streaks";
import {
  createStudentCalendarException,
  deleteStudentCalendarException,
  getStudentSchoolCalendar,
  updateStudentCalendarSchedule
} from "./services/school-calendar";
import {
  awardStudentPoints,
  completeStudentPointIconUpload,
  discardStudentPointIconUpload,
  getStudentPoints,
  prepareStudentPointIconUpload,
  redeemStudentPoints,
  updateStudentPointSettings
} from "./services/student-points";
import {
  getConsumerSafeWordWhitelist,
  getNodeTechnicalVocabularyContext,
  getPioneerWords
} from "./services/vocabulary";
import { getAccountPreferences, updateAccountPreferences } from "./services/preferences";
import {
  attachNativeCatalogItemToLearningYear,
  buildNativeWorkbookLessonPreview,
  completeNativeWorkbookBundle,
  completeNativeWorkbookEdition,
  completeNativeWorkbookReplacement,
  completeNativeWorkbookUpload,
  createNativeWorkbookCartCheckout,
  createNativeWorkbookCheckout,
  deleteNativeWorkbook,
  discardNativeWorkbookBundle,
  discardNativeWorkbookBundleThumbnail,
  discardNativeWorkbookEdition,
  discardNativeWorkbookReplacement,
  discardNativeWorkbookUpload,
  getNativeWorkbookDownloadByToken,
  getNativeWorkbookNavigation,
  getNativeWorkbookPlanningPreview,
  getNativeWorkbookProduct,
  getPurchasedNativeWorkbookDownload,
  listCurriculumSubjectsForAdmin,
  listAdminNativeWorkbooks,
  listAdminNativeWorkbookBundles,
  listNativeWorkbookCatalog,
  listPurchasedNativeWorkbooks,
  prepareNativeWorkbookReplacement,
  prepareNativeWorkbookEdition,
  prepareNativeWorkbookBundle,
  prepareNativeWorkbookBundleThumbnail,
  prepareNativeWorkbookUpload,
  publishNativeWorkbook,
  recommendNativeWorkbooksForLearningYear,
  retryNativeWorkbookIndexing,
  setNativeWorkbookPublished,
  setNativeWorkbookBundlePublished,
  setNativeWorkbookBundleRecommended,
  updateNativeWorkbookBundle,
  updateNativeWorkbookDetails,
  upgradeNativeWorkbookEditionForLearningYear
} from "./services/native-workbooks";
import {
  completeBlogImageUpload,
  createManualBlogPost,
  deleteBlogPost,
  discardBlogImageUpload,
  generateBlogDraft,
  getAdminBlogPost,
  getAdminBlogPreview,
  getBlogImage,
  getPublishedBlogPost,
  listAdminBlogPosts,
  listPublishedBlogPosts,
  prepareBlogImageUpload,
  saveBlogPostRevision,
  unpublishBlogPost
} from "./services/blog";
import {
  deleteSalesFaq,
  listAdminSalesFaqs,
  listPublishedSalesFaqs,
  reorderSalesFaqs,
  saveSalesFaq
} from "./services/sales-faqs";
import { getAdminDashboardMetrics } from "./services/admin-dashboard";
import {
  createWorkbookStudioCurriculum,
  createWorkbookStudioProject,
  createWorkbookThemeVersion,
  getAdminWorkbookStudioCurriculum,
  getAdminWorkbookStudioProject,
  listAdminWorkbookStudio,
  publishWorkbookStudioCurriculum,
  queueWorkbookCurriculumGeneration,
  queueWorkbookGradeLevelGeneration,
  queueWorkbookStudioRender,
  saveWorkbookGenerationPrompt,
  saveWorkbookGenerationRule,
  saveWorkbookStudioCurriculumRevision,
  saveWorkbookStudioRevision,
  setWorkbookCurriculumTheme,
  setWorkbookProjectThemeOverride
} from "./services/workbook-studio";
import { queueWorkbookStudioRelease } from "./services/workbook-studio-release";
import {
  capturePublicFunnelLead,
  completeAdminFunnelAssetUpload,
  completeAdminFunnelExperiment,
  createAdminFunnelTestSale,
  createAdminFunnelPageVariant,
  deleteAdminFunnel,
  deleteAdminFunnelAutomation,
  deleteAdminFunnelStep,
  duplicateAdminFunnelStep,
  generateAdminFunnelPageDraft,
  getAdminFunnel,
  getAdminFunnelContact,
  getAdminFunnelPathAvailability,
  getAdminFunnelOperations,
  getAdminFunnelPage,
  getFunnelAsset,
  getPublicCodeFunnelExperiment,
  getPublicFunnelPage,
  getPublicFunnelPageByPath,
  getPublicFunnelOrderForm,
  listAdminFunnelContacts,
  listAdminFunnels,
  promoteAdminFunnelExperimentWinner,
  prepareAdminFunnelAssetUpload,
  publishAdminFunnelPage,
  recordPublicCodeFunnelEvent,
  recordPublicFunnelEvent,
  reorderAdminFunnelSteps,
  saveAdminFunnel,
  saveAdminFunnelContact,
  saveAdminFunnelAutomation,
  saveAdminFunnelPageDraft,
  saveAdminFunnelStep,
  startAdminFunnelExperiment,
  updateAdminCodeFunnelExperiment,
  discardAdminFunnelAssetUpload,
  unpublishAdminFunnelPage
} from "./services/funnels";
import { recordAuthSessionDiagnostic } from "./services/auth-session-diagnostics";

const server = Bun.serve({
  port: env.PORT,
  idleTimeout: 255,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/internal/") && env.INTERNAL_API_SECRET) {
      const suppliedSecret = request.headers.get("x-treeschool-internal-secret") ?? "";
      const expected = Buffer.from(env.INTERNAL_API_SECRET);
      const supplied = Buffer.from(suppliedSecret);
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
        return Response.json({ error: "Unauthorized internal request." }, { status: 401 });
      }
    }

    if (url.pathname === "/health") {
      const [{ now }] = await db.execute(healthCheck);

      return Response.json({
        status: "ok",
        service: "ts-backend",
        timestamp: now
      });
    }

    if (url.pathname === "/internal/auth/session-diagnostic" && request.method === "POST") {
      try {
        return Response.json(await recordAuthSessionDiagnostic(await request.json()));
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error
              ? error.message
              : "Could not record the authentication diagnostic."
          },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/") {
      return Response.json({
        service: "ts-backend",
        endpoints: ["/health"],
        infrastructure: [
          "accounts",
          "profiles",
          "locales",
          "currencies",
          "denominations",
          "curriculum_nodes",
          "skills",
          "node_translations",
          "localized_content",
          "skill_progress",
          "student_mastery",
          "node_configurations",
          "schedules",
          "lexicon",
          "student_vocabulary",
          "node_keywords"
        ]
      });
    }

    if (url.pathname === "/internal/faqs" && request.method === "GET") {
      try {
        return Response.json({ faqs: await listPublishedSalesFaqs() });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load FAQs." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/admin/dashboard" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
        return Response.json(await getAdminDashboardMetrics(userId));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load admin metrics." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
        return Response.json(await listAdminWorkbookStudio(userId));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load Workbook Studio." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/project" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        const projectId = url.searchParams.get("projectId");
        if (!userId || !projectId) return Response.json({ error: "userId and projectId are required." }, { status: 400 });
        return Response.json(await getAdminWorkbookStudioProject({ userId, projectId }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load the workbook project." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/curriculum" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        const curriculumId = url.searchParams.get("curriculumId");
        if (!userId || !curriculumId) return Response.json({ error: "userId and curriculumId are required." }, { status: 400 });
        return Response.json(await getAdminWorkbookStudioCurriculum({ userId, curriculumId }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load the curriculum." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/project/create" && request.method === "POST") {
      try {
        return Response.json(await createWorkbookStudioProject(await request.json() as Parameters<typeof createWorkbookStudioProject>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not create the workbook project." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/grade/generate" && request.method === "POST") {
      try {
        return Response.json(await queueWorkbookGradeLevelGeneration(await request.json() as Parameters<typeof queueWorkbookGradeLevelGeneration>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not queue grade-level generation." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/project/save" && request.method === "POST") {
      try {
        return Response.json(await saveWorkbookStudioRevision(await request.json() as Parameters<typeof saveWorkbookStudioRevision>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the workbook revision." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/project/render" && request.method === "POST") {
      try {
        return Response.json(await queueWorkbookStudioRender(await request.json() as Parameters<typeof queueWorkbookStudioRender>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not queue the workbook render." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/project/release" && request.method === "POST") {
      try {
        return Response.json(await queueWorkbookStudioRelease(await request.json() as Parameters<typeof queueWorkbookStudioRelease>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not queue the workbook release." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/curriculum/create" && request.method === "POST") {
      try {
        return Response.json(await createWorkbookStudioCurriculum(await request.json() as Parameters<typeof createWorkbookStudioCurriculum>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not create the curriculum." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/curriculum/save" && request.method === "POST") {
      try {
        return Response.json(await saveWorkbookStudioCurriculumRevision(await request.json() as Parameters<typeof saveWorkbookStudioCurriculumRevision>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the curriculum." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/curriculum/publish" && request.method === "POST") {
      try {
        return Response.json(await publishWorkbookStudioCurriculum(await request.json() as Parameters<typeof publishWorkbookStudioCurriculum>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not publish the curriculum." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/curriculum/generate" && request.method === "POST") {
      try {
        return Response.json(await queueWorkbookCurriculumGeneration(await request.json() as Parameters<typeof queueWorkbookCurriculumGeneration>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not generate curriculum workbooks." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/curriculum/theme" && request.method === "POST") {
      try {
        return Response.json(await setWorkbookCurriculumTheme(await request.json() as Parameters<typeof setWorkbookCurriculumTheme>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not change the curriculum theme." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/project/theme" && request.method === "POST") {
      try {
        return Response.json(await setWorkbookProjectThemeOverride(await request.json() as Parameters<typeof setWorkbookProjectThemeOverride>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not change the workbook theme." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/prompt/save" && request.method === "POST") {
      try {
        return Response.json(await saveWorkbookGenerationPrompt(await request.json() as Parameters<typeof saveWorkbookGenerationPrompt>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the generation prompt." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/rule/save" && request.method === "POST") {
      try {
        return Response.json(await saveWorkbookGenerationRule(await request.json() as Parameters<typeof saveWorkbookGenerationRule>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the generation rule." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/workbook-studio/admin/theme/save" && request.method === "POST") {
      try {
        return Response.json(await createWorkbookThemeVersion(await request.json() as Parameters<typeof createWorkbookThemeVersion>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the workbook theme." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
        return Response.json(await listAdminFunnels(userId));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load funnel administration." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/detail" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        const idOrSlug = url.searchParams.get("idOrSlug");
        if (!userId || !idOrSlug) {
          return Response.json({ error: "userId and idOrSlug are required." }, { status: 400 });
        }
        return Response.json(await getAdminFunnel({ userId, idOrSlug }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load the funnel." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/path-availability" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        const path = url.searchParams.get("path");
        const excludeStepId = url.searchParams.get("excludeStepId");
        if (!userId || !path) {
          return Response.json({ error: "userId and path are required." }, { status: 400 });
        }
        return Response.json(await getAdminFunnelPathAvailability({ userId, path, excludeStepId }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not check the URL path." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/operations" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        const funnelId = url.searchParams.get("funnelId");
        if (!userId || !funnelId) {
          return Response.json({ error: "userId and funnelId are required." }, { status: 400 });
        }
        return Response.json(await getAdminFunnelOperations({ userId, funnelId }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load funnel operations." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/contacts" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
        return Response.json(await listAdminFunnelContacts({
          userId,
          query: url.searchParams.get("query")
        }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load contacts." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/contacts/detail" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        const contactId = url.searchParams.get("contactId");
        if (!userId || !contactId) return Response.json({ error: "userId and contactId are required." }, { status: 400 });
        return Response.json(await getAdminFunnelContact({ userId, contactId }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load the contact." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/contacts/save" && request.method === "POST") {
      try {
        return Response.json(await saveAdminFunnelContact(
          await request.json() as Parameters<typeof saveAdminFunnelContact>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the contact." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/automation/save" && request.method === "POST") {
      try {
        return Response.json(await saveAdminFunnelAutomation(
          await request.json() as Parameters<typeof saveAdminFunnelAutomation>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the automation." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/automation/delete" && request.method === "POST") {
      try {
        return Response.json(await deleteAdminFunnelAutomation(
          await request.json() as Parameters<typeof deleteAdminFunnelAutomation>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not delete the automation." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/test-sale" && request.method === "POST") {
      try {
        return Response.json(await createAdminFunnelTestSale(
          await request.json() as Parameters<typeof createAdminFunnelTestSale>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not record the test sale." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/save" && request.method === "POST") {
      try {
        return Response.json(await saveAdminFunnel(await request.json() as Parameters<typeof saveAdminFunnel>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the funnel." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/delete" && request.method === "POST") {
      try {
        return Response.json(await deleteAdminFunnel(
          await request.json() as Parameters<typeof deleteAdminFunnel>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not delete the funnel." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/steps/save" && request.method === "POST") {
      try {
        return Response.json(await saveAdminFunnelStep(await request.json() as Parameters<typeof saveAdminFunnelStep>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the funnel step." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/steps/reorder" && request.method === "POST") {
      try {
        return Response.json(await reorderAdminFunnelSteps(await request.json() as Parameters<typeof reorderAdminFunnelSteps>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not reorder the funnel." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/steps/duplicate" && request.method === "POST") {
      try {
        return Response.json(await duplicateAdminFunnelStep(await request.json() as Parameters<typeof duplicateAdminFunnelStep>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not duplicate the funnel step." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/steps/delete" && request.method === "POST") {
      try {
        return Response.json(await deleteAdminFunnelStep(await request.json() as Parameters<typeof deleteAdminFunnelStep>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not delete the funnel step." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/asset" && request.method === "GET") {
      try {
        const funnelId = url.searchParams.get("funnelId");
        const stepId = url.searchParams.get("stepId");
        const filename = url.searchParams.get("filename");
        if (!funnelId || !stepId || !filename) {
          return Response.json({ error: "funnelId, stepId, and filename are required." }, { status: 400 });
        }
        const asset = await getFunnelAsset({ funnelId, stepId, filename });
        return new Response(asset.bytes, {
          headers: {
            "Content-Type": asset.contentType,
            "Cache-Control": "public, max-age=31536000, immutable"
          }
        });
      } catch {
        return Response.json({ error: "Funnel image not found." }, { status: 404 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/asset/prepare" && request.method === "POST") {
      try {
        return Response.json(await prepareAdminFunnelAssetUpload(
          await request.json() as Parameters<typeof prepareAdminFunnelAssetUpload>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not prepare the funnel image upload." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/asset/complete" && request.method === "POST") {
      try {
        return Response.json(await completeAdminFunnelAssetUpload(
          await request.json() as Parameters<typeof completeAdminFunnelAssetUpload>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the funnel image." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/asset/discard" && request.method === "POST") {
      try {
        return Response.json(await discardAdminFunnelAssetUpload(
          await request.json() as Parameters<typeof discardAdminFunnelAssetUpload>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not discard the funnel image." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/page" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        const funnelId = url.searchParams.get("funnelId");
        const stepId = url.searchParams.get("stepId");
        const pageId = url.searchParams.get("pageId");
        if (!userId || !funnelId || !stepId) {
          return Response.json({ error: "userId, funnelId, and stepId are required." }, { status: 400 });
        }
        return Response.json(await getAdminFunnelPage({ userId, funnelId, stepId, pageId }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load the managed page." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/page/save" && request.method === "POST") {
      try {
        return Response.json(await saveAdminFunnelPageDraft(
          await request.json() as Parameters<typeof saveAdminFunnelPageDraft>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the page draft." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/page/publish" && request.method === "POST") {
      try {
        return Response.json(await publishAdminFunnelPage(
          await request.json() as Parameters<typeof publishAdminFunnelPage>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not publish the page." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/page/unpublish" && request.method === "POST") {
      try {
        return Response.json(await unpublishAdminFunnelPage(
          await request.json() as Parameters<typeof unpublishAdminFunnelPage>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not unpublish the page." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/page/variant" && request.method === "POST") {
      try {
        return Response.json(await createAdminFunnelPageVariant(
          await request.json() as Parameters<typeof createAdminFunnelPageVariant>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not create the page variant." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/page/generate" && request.method === "POST") {
      try {
        return Response.json(await generateAdminFunnelPageDraft(
          await request.json() as Parameters<typeof generateAdminFunnelPageDraft>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not generate the page draft." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/experiment/start" && request.method === "POST") {
      try {
        return Response.json(await startAdminFunnelExperiment(
          await request.json() as Parameters<typeof startAdminFunnelExperiment>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not start the experiment." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/experiment/complete" && request.method === "POST") {
      try {
        return Response.json(await completeAdminFunnelExperiment(
          await request.json() as Parameters<typeof completeAdminFunnelExperiment>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not complete the experiment." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/experiment/promote" && request.method === "POST") {
      try {
        return Response.json(await promoteAdminFunnelExperimentWinner(
          await request.json() as Parameters<typeof promoteAdminFunnelExperimentWinner>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not promote the winning page." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/funnels/admin/code-experiment/update" && request.method === "POST") {
      try {
        return Response.json(await updateAdminCodeFunnelExperiment(
          await request.json() as Parameters<typeof updateAdminCodeFunnelExperiment>[0]
        ));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not update the experiment." }, { status: 400 });
      }
    }

    if (url.pathname === "/public/funnels/code-experiment" && request.method === "GET") {
      try {
        const funnelSlug = url.searchParams.get("funnelSlug");
        const stepSlug = url.searchParams.get("stepSlug");
        const visitorId = url.searchParams.get("visitorId");
        if (!funnelSlug || !stepSlug || !visitorId) {
          return Response.json({ error: "Not found." }, { status: 404 });
        }
        return Response.json(await getPublicCodeFunnelExperiment({ funnelSlug, stepSlug, visitorId }));
      } catch {
        return Response.json({ error: "Not found." }, { status: 404 });
      }
    }

    if (url.pathname === "/public/funnels/page" && request.method === "GET") {
      try {
        const funnelSlug = url.searchParams.get("funnelSlug");
        const stepSlug = url.searchParams.get("stepSlug");
        const visitorId = url.searchParams.get("visitorId");
        if (!funnelSlug) return Response.json({ error: "Not found." }, { status: 404 });
        return Response.json(await getPublicFunnelPage({ funnelSlug, stepSlug, visitorId }));
      } catch {
        return Response.json({ error: "Not found." }, { status: 404 });
      }
    }


    if (url.pathname === "/public/funnels/page-by-path" && request.method === "GET") {
      try {
        const path = url.searchParams.get("path");
        const visitorId = url.searchParams.get("visitorId");
        if (!path) return Response.json({ error: "Not found." }, { status: 404 });
        return Response.json(await getPublicFunnelPageByPath({ path, visitorId }));
      } catch {
        return Response.json({ error: "Not found." }, { status: 404 });
      }
    }

    if (url.pathname === "/public/funnels/events" && request.method === "POST") {
      try {
        return Response.json(await recordPublicFunnelEvent(
          await request.json() as Parameters<typeof recordPublicFunnelEvent>[0]
        ));
      } catch {
        return Response.json({ error: "Could not record funnel activity." }, { status: 400 });
      }
    }

    if (url.pathname === "/public/funnels/code-events" && request.method === "POST") {
      try {
        return Response.json(await recordPublicCodeFunnelEvent(
          await request.json() as Parameters<typeof recordPublicCodeFunnelEvent>[0]
        ));
      } catch {
        return Response.json({ error: "Could not record funnel activity." }, { status: 400 });
      }
    }

    if (url.pathname === "/public/funnels/leads" && request.method === "POST") {
      try {
        return Response.json(await capturePublicFunnelLead(
          await request.json() as Parameters<typeof capturePublicFunnelLead>[0]
        ));
      } catch {
        return Response.json({ error: "Could not save your details. Please try again." }, { status: 400 });
      }
    }

    if (url.pathname === "/public/funnels/order-form" && request.method === "GET") {
      try {
        const path = url.searchParams.get("path");
        if (!path) return Response.json({ error: "path is required." }, { status: 400 });
        return Response.json(await getPublicFunnelOrderForm({ path }));
      } catch {
        return Response.json({ error: "Order form not found." }, { status: 404 });
      }
    }

    if (url.pathname === "/internal/faqs/admin" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
        return Response.json(await listAdminSalesFaqs(userId));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load FAQ administration." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/faqs/admin/save" && request.method === "POST") {
      try {
        return Response.json(await saveSalesFaq(await request.json() as Parameters<typeof saveSalesFaq>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the FAQ." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/faqs/admin/reorder" && request.method === "POST") {
      try {
        return Response.json(await reorderSalesFaqs(await request.json() as Parameters<typeof reorderSalesFaqs>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not reorder the FAQs." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/faqs/admin/delete" && request.method === "POST") {
      try {
        return Response.json(await deleteSalesFaq(await request.json() as Parameters<typeof deleteSalesFaq>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not delete the FAQ." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/posts" && request.method === "GET") {
      try {
        return Response.json({ posts: await listPublishedBlogPosts({
          category: url.searchParams.get("category"),
          limit: Number(url.searchParams.get("limit") || 50)
        }) });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load blog posts." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/image" && request.method === "GET") {
      try {
        const postId = url.searchParams.get("postId");
        const filename = url.searchParams.get("filename");
        if (!postId || !filename) return Response.json({ error: "postId and filename are required." }, { status: 400 });
        const image = await getBlogImage({ postId, filename });
        return new Response(image.bytes, {
          headers: {
            "Content-Type": image.contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff"
          }
        });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Blog image not found." }, { status: 404 });
      }
    }

    if (url.pathname === "/internal/blog/post" && request.method === "GET") {
      try {
        const slug = url.searchParams.get("slug");
        if (!slug) return Response.json({ error: "slug is required." }, { status: 400 });
        const post = await getPublishedBlogPost(slug);
        return post ? Response.json(post) : Response.json({ error: "Blog post not found." }, { status: 404 });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load the blog post." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
        return Response.json(await listAdminBlogPosts(userId));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load blog administration." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin/post" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        const postId = url.searchParams.get("postId");
        if (!userId || !postId) return Response.json({ error: "userId and postId are required." }, { status: 400 });
        return Response.json(await getAdminBlogPost({ userId, postId }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load the blog post." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin/preview" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        const postId = url.searchParams.get("postId");
        if (!userId || !postId) return Response.json({ error: "userId and postId are required." }, { status: 400 });
        return Response.json({ post: await getAdminBlogPreview({ userId, postId }) });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not preview the blog post." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin/create" && request.method === "POST") {
      try {
        return Response.json(await createManualBlogPost(await request.json() as Parameters<typeof createManualBlogPost>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not create the blog post." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin/save" && request.method === "POST") {
      try {
        return Response.json(await saveBlogPostRevision(await request.json() as Parameters<typeof saveBlogPostRevision>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the blog post." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin/generate" && request.method === "POST") {
      try {
        return Response.json(await generateBlogDraft(await request.json() as Parameters<typeof generateBlogDraft>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not generate the blog draft." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin/unpublish" && request.method === "POST") {
      try {
        return Response.json(await unpublishBlogPost(await request.json() as Parameters<typeof unpublishBlogPost>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not unpublish the blog post." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin/delete" && request.method === "POST") {
      try {
        return Response.json(await deleteBlogPost(await request.json() as Parameters<typeof deleteBlogPost>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not delete the blog post." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin/image/prepare" && request.method === "POST") {
      try {
        return Response.json(await prepareBlogImageUpload(await request.json() as Parameters<typeof prepareBlogImageUpload>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not prepare the blog image upload." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin/image/complete" && request.method === "POST") {
      try {
        return Response.json(await completeBlogImageUpload(await request.json() as Parameters<typeof completeBlogImageUpload>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not save the blog image." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/blog/admin/image/discard" && request.method === "POST") {
      try {
        return Response.json(await discardBlogImageUpload(await request.json() as Parameters<typeof discardBlogImageUpload>[0]));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not discard the blog image upload." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/navigation" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
        return Response.json(await getNativeWorkbookNavigation(userId));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load navigation." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/catalog" && request.method === "GET") {
      try {
        const rawGrade = url.searchParams.get("grade");
        return Response.json({
          workbooks: await listNativeWorkbookCatalog({
            userId: url.searchParams.get("userId"),
            profileId: url.searchParams.get("profileId"),
            grade: rawGrade == null || rawGrade === "" ? null : Number(rawGrade),
            subject: url.searchParams.get("subject")
          })
        });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load the bookstore." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/product" && request.method === "GET") {
      try {
        const slug = url.searchParams.get("slug");
        if (!slug) return Response.json({ error: "slug is required." }, { status: 400 });
        return Response.json(await getNativeWorkbookProduct({ slug, userId: url.searchParams.get("userId") }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load the workbook.";
        return Response.json({ error: message }, { status: ["Workbook not found.", "Catalog item not found."].includes(message) ? 404 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/planning-preview" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      const learningYearId = url.searchParams.get("learningYearId");
      const documentId = url.searchParams.get("documentId");
      if (!userId || !learningYearId || !documentId) {
        return Response.json({ error: "userId, learningYearId, and documentId are required." }, { status: 400 });
      }
      try {
        return Response.json(await getNativeWorkbookPlanningPreview({ userId, learningYearId, documentId }));
      } catch (error) {
        return Response.json({
          error: error instanceof Error ? error.message : "Could not load the indexed workbook lessons."
        }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/lesson-preview" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      const learningYearId = url.searchParams.get("learningYearId");
      const documentId = url.searchParams.get("documentId");
      const learningUnitId = url.searchParams.get("learningUnitId");
      if (!userId || !learningYearId || !documentId || !learningUnitId) {
        return Response.json({ error: "userId, learningYearId, documentId, and learningUnitId are required." }, { status: 400 });
      }
      try {
        const preview = await buildNativeWorkbookLessonPreview({ userId, learningYearId, documentId, learningUnitId });
        return new Response(preview.bytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${preview.filename}"`,
            "Cache-Control": "private, no-store"
          }
        });
      } catch (error) {
        return Response.json({
          error: error instanceof Error ? error.message : "Could not build the indexed lesson preview."
        }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/purchased" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
        return Response.json({ workbooks: await listPurchasedNativeWorkbooks(userId) });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not load purchased workbooks." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin" && request.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
        const [workbooks, bundles, subjects] = await Promise.all([
          listAdminNativeWorkbooks(userId),
          listAdminNativeWorkbookBundles(userId),
          listCurriculumSubjectsForAdmin(userId)
        ]);
        return Response.json({ workbooks, bundles, subjects });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load workbook administration.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/prepare" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof prepareNativeWorkbookUpload>[0];
        return Response.json(await prepareNativeWorkbookUpload(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not prepare the workbook upload.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/bundles/prepare" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof prepareNativeWorkbookBundle>[0];
        return Response.json(await prepareNativeWorkbookBundle(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not prepare the workbook bundle.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/bundles/complete" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof completeNativeWorkbookBundle>[0];
        return Response.json(await completeNativeWorkbookBundle(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not complete the workbook bundle.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/bundles/thumbnail/prepare" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof prepareNativeWorkbookBundleThumbnail>[0];
        return Response.json(await prepareNativeWorkbookBundleThumbnail(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not prepare the replacement bundle thumbnail.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/bundles/thumbnail/discard" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof discardNativeWorkbookBundleThumbnail>[0];
        return Response.json(await discardNativeWorkbookBundleThumbnail(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not discard the replacement bundle thumbnail.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/bundles/update" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof updateNativeWorkbookBundle>[0];
        return Response.json(await updateNativeWorkbookBundle(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update the workbook bundle.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/bundles/discard" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof discardNativeWorkbookBundle>[0];
        return Response.json(await discardNativeWorkbookBundle(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not discard the workbook bundle.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/bundles/visibility" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof setNativeWorkbookBundlePublished>[0];
        return Response.json(await setNativeWorkbookBundlePublished(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update workbook bundle visibility.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/bundles/recommendation" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof setNativeWorkbookBundleRecommended>[0];
        return Response.json(await setNativeWorkbookBundleRecommended(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update the recommended curriculum.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/complete" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof completeNativeWorkbookUpload>[0];
        const result = await completeNativeWorkbookUpload(body);
        await triggerProcessorJob().catch((error) => console.error("Could not start native workbook processor:", error));
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not complete the workbook upload.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/discard" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof discardNativeWorkbookUpload>[0];
        return Response.json(await discardNativeWorkbookUpload(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not discard the incomplete workbook upload.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/replacement/prepare" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof prepareNativeWorkbookReplacement>[0];
        return Response.json(await prepareNativeWorkbookReplacement(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not prepare the replacement PDF upload.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/replacement/complete" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof completeNativeWorkbookReplacement>[0];
        const result = await completeNativeWorkbookReplacement(body);
        await triggerProcessorJob().catch((error) => console.error("Could not start native workbook processor:", error));
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not complete the replacement PDF upload.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/replacement/discard" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof discardNativeWorkbookReplacement>[0];
        return Response.json(await discardNativeWorkbookReplacement(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not discard the replacement PDF upload.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/editions/prepare" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof prepareNativeWorkbookEdition>[0];
        return Response.json(await prepareNativeWorkbookEdition(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not prepare the new edition.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/editions/complete" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof completeNativeWorkbookEdition>[0];
        const result = await completeNativeWorkbookEdition(body);
        await triggerProcessorJob().catch((error) => console.error("Could not start native workbook processor:", error));
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not complete the new-edition upload.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/editions/discard" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof discardNativeWorkbookEdition>[0];
        return Response.json(await discardNativeWorkbookEdition(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not discard the new-edition upload.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/delete" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof deleteNativeWorkbook>[0];
        return Response.json(await deleteNativeWorkbook(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not delete the workbook.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/edition-upgrade" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof upgradeNativeWorkbookEditionForLearningYear>[0];
        return Response.json(await upgradeNativeWorkbookEditionForLearningYear(body));
      } catch (error) {
        return Response.json({
          error: error instanceof Error ? error.message : "Could not update the workbook edition."
        }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/details" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof updateNativeWorkbookDetails>[0];
        return Response.json(await updateNativeWorkbookDetails(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update the workbook details.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/retry" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof retryNativeWorkbookIndexing>[0];
        const result = await retryNativeWorkbookIndexing(body);
        await triggerProcessorJob().catch((error) => console.error("Could not start native workbook processor:", error));
        return Response.json(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not retry workbook indexing.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/publish" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof publishNativeWorkbook>[0];
        return Response.json(await publishNativeWorkbook(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not publish the workbook.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/admin/visibility" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof setNativeWorkbookPublished>[0];
        return Response.json(await setNativeWorkbookPublished(body));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not update workbook visibility.";
        return Response.json({ error: message }, { status: message === "Administrator access is required." ? 403 : 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/attach" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof attachNativeCatalogItemToLearningYear>[0];
        return Response.json(await attachNativeCatalogItemToLearningYear(body));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not add the workbook." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/checkout" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof createNativeWorkbookCheckout>[0];
        return Response.json(await createNativeWorkbookCheckout(body));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not start workbook checkout." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/cart-checkout" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof createNativeWorkbookCartCheckout>[0];
        return Response.json(await createNativeWorkbookCartCheckout(body));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not start cart checkout." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/native-workbooks/download" && request.method === "GET") {
      try {
        const token = url.searchParams.get("token");
        const userId = url.searchParams.get("userId");
        const purchaseId = url.searchParams.get("purchaseId");
        const result = token
          ? await getNativeWorkbookDownloadByToken(token)
          : userId && purchaseId
            ? await getPurchasedNativeWorkbookDownload({ userId, purchaseId })
            : null;
        if (!result) return Response.json({ error: "A download token or signed-in purchase is required." }, { status: 400 });
        return new Response(result.bytes, {
          headers: {
            "Content-Type": result.mimeType || "application/pdf",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
            "Cache-Control": "private, no-store"
          }
        });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not download the workbook." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/maintenance/run" && request.method === "POST") {
      if (!env.MAINTENANCE_JOB_SECRET) {
        return Response.json(
          {
            error: "Maintenance job is not configured."
          },
          { status: 503 }
        );
      }

      const providedSecret = request.headers.get("x-maintenance-secret");
      if (providedSecret !== env.MAINTENANCE_JOB_SECRET) {
        return Response.json(
          {
            error: "Unauthorized."
          },
          { status: 401 }
        );
      }

      return Response.json(await runMaintenanceJob());
    }

    if (url.pathname === "/internal/paper-plan/completeness" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          parentUserId?: string;
          learningYearId?: string;
        };
        if (!body.parentUserId || !body.learningYearId) {
          return Response.json({ error: "parentUserId and learningYearId are required." }, { status: 400 });
        }
        await requirePremiumFeatureAccess(body.parentUserId);
        const result = await evaluateLearningYearCurriculumCompleteness(
          body.parentUserId,
          body.learningYearId
        );
        const recommendationGroups = await recommendNativeWorkbooksForLearningYear({
          userId: body.parentUserId,
          learningYearId: body.learningYearId,
          concerns: result.concerns
        });
        return Response.json({
          ...result,
          concerns: result.concerns.map((concern) => ({
            ...concern,
            workbooks: recommendationGroups.find((group) => group.subject === concern.subject)?.workbooks ?? []
          }))
        });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not review curriculum completeness." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const profileId = url.searchParams.get("profileId");
      if (!parentUserId || !profileId) {
        return Response.json({ error: "parentUserId and profileId are required." }, { status: 400 });
      }
      try {
        return Response.json(await getPaperPlan(parentUserId, profileId));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to load the learning plan." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/manifest" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const weeklyPlanId = url.searchParams.get("weeklyPlanId");
      if (!parentUserId || !weeklyPlanId) {
        return Response.json({ error: "parentUserId and weeklyPlanId are required." }, { status: 400 });
      }
      try {
        return Response.json(await getWeeklyPlanManifest(parentUserId, weeklyPlanId));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to build the weekly plan manifest.";
        return Response.json(
          { error: message },
          { status: message === "Administrator access is required." ? 403 : 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/year" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        title?: string;
        totalWeeks?: number;
        startDate?: string | null;
        endDate?: string | null;
        teachingDaysPerWeek?: number | null;
        printPageSize?: string | null;
      };
      if (!body.parentUserId || !body.profileId || !body.title) {
        return Response.json(
          { error: "parentUserId, profileId, and title are required." },
          { status: 400 }
        );
      }
      try {
        await requirePremiumFeatureAccess(body.parentUserId);
        return Response.json(
          await createLearningYear({
            parentUserId: body.parentUserId,
            profileId: body.profileId,
            title: body.title,
            totalWeeks: body.totalWeeks ?? 36,
            startDate: body.startDate,
            endDate: body.endDate,
            teachingDaysPerWeek: body.teachingDaysPerWeek,
            printPageSize: body.printPageSize
          }),
          { status: 201 }
        );
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to create learning year." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/year" && request.method === "PATCH") {
      const body = (await request.json()) as {
        parentUserId?: string;
        learningYearId?: string;
        totalWeeks?: number;
        startDate?: string | null;
        endDate?: string | null;
        teachingDaysPerWeek?: number | null;
        printPageSize?: string | null;
      };
      if (!body.parentUserId || !body.learningYearId) {
        return Response.json(
          { error: "parentUserId and learningYearId are required." },
          { status: 400 }
        );
      }
      try {
        await requirePremiumFeatureAccess(body.parentUserId);
        return Response.json(await updateLearningYearDetails({
          parentUserId: body.parentUserId,
          learningYearId: body.learningYearId,
          totalWeeks: body.totalWeeks ?? 36,
          startDate: body.startDate,
          endDate: body.endDate,
          teachingDaysPerWeek: body.teachingDaysPerWeek,
          printPageSize: body.printPageSize
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to update learning year." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/documents" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const files = [...formData.getAll("files"), ...formData.getAll("file")].flatMap((entry) => {
          if (typeof entry === "string" || !(entry instanceof Blob) || !("name" in entry)) {
            return [];
          }
          const file = entry as Blob & { name: string; type: string; size: number };
          return file.size > 0 ? [file] : [];
        });
        if (files.length === 0 || files.some((file) => !classifyPaperPlanUpload(file.name, file.type))) {
          return Response.json(
            { error: "Add at least one PDF, text, or image file." },
            { status: 400 }
          );
        }
        const parentUserId = String(formData.get("parentUserId") ?? "").trim();
        const learningYearId = String(formData.get("learningYearId") ?? "").trim();
        const label = String(formData.get("label") ?? "").trim();
        const subjectId = String(formData.get("subjectId") ?? "").trim();
        const subjectLabel = String(formData.get("subjectLabel") ?? "").trim();
        const documentRole = String(formData.get("documentRole") ?? "student").trim();
        const parentNotes = String(formData.get("parentNotes") ?? "").trim();
        const clientUploadId = String(formData.get("clientUploadId") ?? "").trim();
        const materialSetId = String(formData.get("materialSetId") ?? "").trim();
        const prerequisiteMaterialSetId = String(formData.get("prerequisiteMaterialSetId") ?? "").trim();
        const subjectDaysPerWeekValue = String(formData.get("subjectDaysPerWeek") ?? "").trim();
        const subjectDaysPerWeek = subjectDaysPerWeekValue ? Number(subjectDaysPerWeekValue) : null;
        if (!parentUserId || !learningYearId) {
          return Response.json(
            { error: "parentUserId and learningYearId are required." },
            { status: 400 }
          );
        }
        await requirePremiumFeatureAccess(parentUserId);
        const documents = [];
        for (const [fileIndex, file] of files.entries()) {
          const fileKind = classifyPaperPlanUpload(file.name, file.type);
          if (!fileKind) continue;
          const fallbackLabel = file.name.replace(/\.[^.]+$/i, "").replace(/[_-]+/g, " ").trim();
          documents.push(await uploadContentDocument({
            parentUserId,
            learningYearId,
            label: files.length === 1 ? label || fallbackLabel || file.name : fallbackLabel || label || file.name,
            subjectId: subjectId || null,
            subjectLabel: subjectLabel || null,
            documentRole,
            mimeType: fileKind.contentType,
            sourceKind: fileKind.sourceKind,
            parentNotes: parentNotes || null,
            clientUploadId: clientUploadId ? `${clientUploadId}:${fileIndex}` : null,
            materialSetId: materialSetId || clientUploadId || null,
            prerequisiteMaterialSetId: prerequisiteMaterialSetId || null,
            subjectDaysPerWeek,
            filename: file.name,
            bytes: new Uint8Array(await file.arrayBuffer())
          }));
        }
        return Response.json(
          {
            documents
          },
          { status: 201 }
        );
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to upload curriculum files." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/documents" && request.method === "DELETE") {
      const body = (await request.json()) as {
        parentUserId?: string;
        documentId?: string;
      };
      if (!body.parentUserId || !body.documentId) {
        return Response.json(
          { error: "parentUserId and documentId are required." },
          { status: 400 }
        );
      }
      try {
        await requirePremiumFeatureAccess(body.parentUserId);
        return Response.json(await deleteContentDocument(body.parentUserId, body.documentId));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to remove file." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/documents" && request.method === "PATCH") {
      const body = (await request.json()) as {
        parentUserId?: string;
        documentId?: string;
        label?: string;
        subjectLabel?: string | null;
        parentNotes?: string | null;
        subjectDaysPerWeek?: number | null;
        prerequisiteMaterialSetId?: string | null;
      };
      if (!body.parentUserId || !body.documentId || !body.label?.trim()) {
        return Response.json(
          { error: "parentUserId, documentId, and label are required." },
          { status: 400 }
        );
      }
      try {
        await requirePremiumFeatureAccess(body.parentUserId);
        return Response.json(await updateContentDocumentMetadata({
          parentUserId: body.parentUserId,
          documentId: body.documentId,
          label: body.label,
          subjectLabel: body.subjectLabel,
          parentNotes: body.parentNotes,
          subjectDaysPerWeek: body.subjectDaysPerWeek,
          prerequisiteMaterialSetId: body.prerequisiteMaterialSetId
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to update material." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/restore" && request.method === "POST") {
      const body = (await request.json()) as { parentUserId?: string; learningYearId?: string };
      if (!body.parentUserId || !body.learningYearId) {
        return Response.json({ error: "parentUserId and learningYearId are required." }, { status: 400 });
      }
      try {
        await requirePremiumFeatureAccess(body.parentUserId);
        return Response.json(await restorePreviousPlanVersion(body.parentUserId, body.learningYearId));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to restore the previous plan." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/generate" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        learningYearId?: string;
      };
      if (!body.parentUserId || !body.learningYearId) {
        return Response.json(
          { error: "parentUserId and learningYearId are required." },
          { status: 400 }
        );
      }
      try {
        await requirePremiumFeatureAccess(body.parentUserId);
        const result = await startLearningYearPlanning(body.parentUserId, body.learningYearId);
        const processor = await triggerProcessorJob().catch((error) => {
          console.error("Could not immediately start the lesson-plan processor:", error);
          return { triggered: false, reason: "trigger_failed" } as const;
        });
        return Response.json({ ...result, processor });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to start planning." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/retry" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        learningYearId?: string;
      };
      if (!body.parentUserId || !body.learningYearId) {
        return Response.json(
          { error: "parentUserId and learningYearId are required." },
          { status: 400 }
        );
      }
      try {
        await requirePremiumFeatureAccess(body.parentUserId);
        const result = await retryFailedLearningYearPlanning(body.parentUserId, body.learningYearId);
        await triggerProcessorJob().catch((error) => {
          console.error("Could not immediately start the planning retry job:", error);
        });
        return Response.json(result);
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to retry planning." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/week/practice" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        weeklyPlanId?: string;
        compressed?: boolean;
      };
      if (!body.parentUserId || !body.weeklyPlanId || typeof body.compressed !== "boolean") {
        return Response.json(
          { error: "parentUserId, weeklyPlanId, and compressed are required." },
          { status: 400 }
        );
      }
      try {
        await requirePremiumFeatureAccess(body.parentUserId);
        return Response.json(await setWeeklyPlanPracticeCompression({
          parentUserId: body.parentUserId,
          weeklyPlanId: body.weeklyPlanId,
          compressed: body.compressed
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to adjust weekly practice pages." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/lesson-disposition" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        weeklyPlanItemId?: string;
        disposition?: "include" | "already_mastered" | "save_for_later" | "remove";
      };
      if (!body.parentUserId || !body.weeklyPlanItemId || !body.disposition) {
        return Response.json(
          { error: "parentUserId, weeklyPlanItemId, and disposition are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await setLessonDisposition({
          parentUserId: body.parentUserId,
          weeklyPlanItemId: body.weeklyPlanItemId,
          disposition: body.disposition
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to update the lesson." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/day-grade" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        weeklyPlanId?: string;
        dayNumber?: number;
        subjectKey?: string;
        score?: number | null;
      };
      if (!body.parentUserId || !body.weeklyPlanId || !body.dayNumber || !body.subjectKey) {
        return Response.json(
          { error: "parentUserId, weeklyPlanId, dayNumber, and subjectKey are required." },
          { status: 400 }
        );
      }
      try {
        await requirePremiumFeatureAccess(body.parentUserId);
        return Response.json(await setWeeklyPlanDaySubjectGrade({
          parentUserId: body.parentUserId,
          weeklyPlanId: body.weeklyPlanId,
          dayNumber: body.dayNumber,
          subjectKey: body.subjectKey,
          score: body.score ?? null
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to save grade." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/lesson-preview" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const weeklyPlanItemId = url.searchParams.get("weeklyPlanItemId");
      if (!parentUserId || !weeklyPlanItemId) {
        return Response.json(
          { error: "parentUserId and weeklyPlanItemId are required." },
          { status: 400 }
        );
      }
      try {
        const preview = await buildLessonPreview(parentUserId, weeklyPlanItemId);
        return new Response(preview.bytes, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${preview.filename}"`,
            "Cache-Control": "private, no-store"
          }
        });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to build the lesson preview." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/packet" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const weeklyPlanId = url.searchParams.get("weeklyPlanId");
      const format = url.searchParams.get("format") === "days" ? "days" : "week";
      const twoUp = url.searchParams.get("layout") === "two-up";
      if (!parentUserId || !weeklyPlanId) {
        return Response.json(
          { error: "parentUserId and weeklyPlanId are required." },
          { status: 400 }
        );
      }
      let downloadEventId: string | null = null;
      try {
        downloadEventId = await beginWeeklyPlanDownload({
          parentUserId,
          weeklyPlanId,
          format,
          layout: twoUp ? "two-up" : "standard"
        });
        const packet = format === "days"
          ? await buildWeeklyPacketDayArchive(parentUserId, weeklyPlanId, { twoUp })
          : await buildWeeklyPacket(parentUserId, weeklyPlanId, { twoUp });
        await completeWeeklyPlanDownload({
          parentUserId,
          weeklyPlanId,
          downloadEventId
        });
        return new Response(packet.bytes, {
          headers: {
            "Content-Type": format === "days" ? "application/zip" : "application/pdf",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(packet.filename)}`,
            "Cache-Control": "private, no-store"
          }
        });
      } catch (error) {
        if (downloadEventId) {
          await discardWeeklyPlanDownload({ parentUserId, downloadEventId }).catch((cleanupError) => {
            console.warn("Could not discard an incomplete weekly-plan download event.", cleanupError);
          });
        }
        const reference = `PDF-${weeklyPlanId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
        console.error(`[${reference}] Could not build weekly PDF packet:`, error);
        return Response.json(
          {
            error: `We couldn't prepare this PDF. Please try again, or contact support if the problem continues. Reference: ${reference}`,
            reference
          },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/paper-plan/qr-destination" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const weeklyPlanId = url.searchParams.get("weeklyPlanId");
      if (!parentUserId || !weeklyPlanId) {
        return Response.json(
          { error: "parentUserId and weeklyPlanId are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await getWeeklyPlanQrDestination(parentUserId, weeklyPlanId));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to open this lesson-plan day." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/plan-pack/intake" && request.method === "POST") {
      const body = (await request.json()) as {
        email?: string;
        draft?: {
          studentName?: string | null;
          studentGradeLevel?: number | null;
          learningYearTitle?: string | null;
          holidayWeeks?: number | null;
          teachingDaysPerWeek?: number | null;
          startDate?: string | null;
          endDate?: string | null;
          preferredPrintPageSize?: string | null;
          totalWeeks?: number | null;
          nativeCatalogItemIds?: string[];
          subjects?: Array<{
            materialSetId?: string | null;
            prerequisiteMaterialSetId?: string | null;
            subjectLabel?: string | null;
            documentRole?: string | null;
            parentNotes?: string | null;
            daysPerWeek?: number | null;
          }>;
        };
      };

      if (!body.email) {
        return Response.json({ error: "email is required." }, { status: 400 });
      }

      try {
        return Response.json(
          await createPlanPackIntake({
            email: body.email,
            draft: {
              studentName: body.draft?.studentName ?? null,
              studentGradeLevel: body.draft?.studentGradeLevel ?? null,
              learningYearTitle: body.draft?.learningYearTitle ?? null,
              holidayWeeks: body.draft?.holidayWeeks ?? null,
              teachingDaysPerWeek: body.draft?.teachingDaysPerWeek ?? 5,
              startDate: body.draft?.startDate ?? null,
              endDate: body.draft?.endDate ?? null,
              preferredPrintPageSize: body.draft?.preferredPrintPageSize ?? null,
              totalWeeks: body.draft?.totalWeeks ?? 12,
              nativeCatalogItemIds: Array.isArray(body.draft?.nativeCatalogItemIds)
                ? body.draft.nativeCatalogItemIds
                : [],
              subjects: Array.isArray(body.draft?.subjects) ? body.draft.subjects : []
            }
          }),
          { status: 201 }
        );
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to create plan pack intake." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/plan-pack/pricing" && request.method === "GET") {
      try {
        return Response.json(await getPlanGeneratorPricing());
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to load generator pricing." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/plan-pack/checkout" && request.method === "POST") {
      const body = (await request.json()) as {
        intakeId?: string;
        successUrl?: string;
        cancelUrl?: string;
        checkoutKind?: "one_time" | "subscription";
      };

      if (!body.intakeId || !body.successUrl || !body.cancelUrl) {
        return Response.json(
          { error: "intakeId, successUrl, and cancelUrl are required." },
          { status: 400 }
        );
      }

      try {
        return Response.json(
          await createPlanPackCheckoutForIntake({
            intakeId: body.intakeId,
            successUrl: body.successUrl,
            cancelUrl: body.cancelUrl,
            checkoutKind: body.checkoutKind
          })
        );
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to create checkout session." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/plan-pack/status" && request.method === "GET") {
      const intakeId = url.searchParams.get("intakeId");
      const checkoutSessionId = url.searchParams.get("checkoutSessionId");

      if (!intakeId || !checkoutSessionId) {
        return Response.json(
          { error: "intakeId and checkoutSessionId are required." },
          { status: 400 }
        );
      }

      try {
        return Response.json(await getPlanPackIntakeStatus({ intakeId, checkoutSessionId }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to load plan pack status." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/plan-pack/curriculum-review" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          intakeId?: string;
          checkoutSessionId?: string;
          action?: "evaluate" | "approve";
        };
        if (!body.intakeId || !body.checkoutSessionId) {
          return Response.json({ error: "intakeId and checkoutSessionId are required." }, { status: 400 });
        }
        if (body.action === "approve") {
          const result = await approvePlanPackCurriculum({
            intakeId: body.intakeId,
            checkoutSessionId: body.checkoutSessionId
          });
          const processor = await triggerProcessorJob().catch((error) => {
            console.error("Could not immediately start plan generation:", error);
            return { triggered: false, reason: "trigger_failed" } as const;
          });
          return Response.json({ ...result, processor });
        }
        return Response.json(await evaluatePlanPackCurriculum({
          intakeId: body.intakeId,
          checkoutSessionId: body.checkoutSessionId
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not review the curriculum." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/plan-pack/native-workbook" && request.method === "POST") {
      const body = await request.json() as {
        intakeId?: string;
        checkoutSessionId?: string;
        workbookId?: string;
      };
      if (!body.intakeId || !body.checkoutSessionId || !body.workbookId) {
        return Response.json({ error: "intakeId, checkoutSessionId, and workbookId are required." }, { status: 400 });
      }
      try {
        return Response.json(await attachPlanPackNativeWorkbook({
          intakeId: body.intakeId,
          checkoutSessionId: body.checkoutSessionId,
          workbookId: body.workbookId
        }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not add the workbook." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/plan-pack/retry" && request.method === "POST") {
      const body = (await request.json()) as { intakeId?: string };
      if (!body.intakeId) {
        return Response.json({ error: "intakeId is required." }, { status: 400 });
      }
      try {
        const result = await retryFailedPlanPackJobs(body.intakeId);
        await triggerProcessorJob().catch((error) => {
          console.error("Could not immediately start the processor retry job:", error);
        });
        return Response.json(result);
      } catch (error) {
        return Response.json({
          error: error instanceof Error ? error.message : "Could not retry this plan pack."
        }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/plan-pack/week/practice" && request.method === "POST") {
      const body = (await request.json()) as {
        intakeId?: string;
        checkoutSessionId?: string;
        weeklyPlanId?: string;
        compressed?: boolean;
      };
      if (!body.intakeId || !body.checkoutSessionId || !body.weeklyPlanId || typeof body.compressed !== "boolean") {
        return Response.json(
          { error: "intakeId, checkoutSessionId, weeklyPlanId, and compressed are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await setPlanPackWeeklyPracticeCompression({
          intakeId: body.intakeId,
          checkoutSessionId: body.checkoutSessionId,
          weeklyPlanId: body.weeklyPlanId,
          compressed: body.compressed
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to adjust weekly practice pages." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/plan-pack/packet" && request.method === "GET") {
      const intakeId = url.searchParams.get("intakeId");
      const checkoutSessionId = url.searchParams.get("checkoutSessionId");
      const weeklyPlanId = url.searchParams.get("weeklyPlanId");
      const format = url.searchParams.get("format") === "days" ? "days" : "week";

      if (!intakeId || !checkoutSessionId || !weeklyPlanId) {
        return Response.json(
          { error: "intakeId, checkoutSessionId, and weeklyPlanId are required." },
          { status: 400 }
        );
      }

      try {
        const packet = await buildPlanPackWeeklyPacket({
          intakeId,
          checkoutSessionId,
          weeklyPlanId,
          format
        });
        return new Response(packet.bytes, {
          headers: {
            "Content-Type": format === "days" ? "application/zip" : "application/pdf",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(packet.filename)}`,
            "Cache-Control": "private, no-store"
          }
        });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to build weekly PDF." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/plan-pack/complete" && request.method === "POST") {
      let intakeId = "";

      try {
        const formData = await request.formData();
        intakeId = String(formData.get("intakeId") ?? "").trim();
        const checkoutSessionId = String(formData.get("checkoutSessionId") ?? "").trim();
        const draft = JSON.parse(String(formData.get("draft") ?? "{}")) as {
          studentName?: string | null;
          learningYearTitle?: string | null;
          totalWeeks?: number | null;
          teachingDaysPerWeek?: number | null;
          preferredPrintPageSize?: string | null;
          subjects: Array<{
            materialSetId?: string | null;
            prerequisiteMaterialSetId?: string | null;
            subjectLabel?: string | null;
            documentRole?: string | null;
            parentNotes?: string | null;
            daysPerWeek?: number | null;
          }>;
        };
        const fileDescriptors = JSON.parse(String(formData.get("fileDescriptors") ?? "[]")) as Array<{
          subjectIndex?: number;
        }>;
        const files: Array<Blob & { name: string; type: string; size: number }> = [];
        for (const entry of formData.getAll("files")) {
          if (typeof entry === "string" || !(entry instanceof Blob)) continue;
          const file = entry as Blob & Partial<{ name: string; type: string; size: number }>;
          if (typeof file.name === "string" && file.size > 0) {
            files.push(file as Blob & { name: string; type: string; size: number });
          }
        }

        if (!intakeId || !checkoutSessionId) {
          return Response.json(
            { error: "intakeId and checkoutSessionId are required." },
            { status: 400 }
          );
        }

        if (!Array.isArray(draft.subjects) || draft.subjects.length === 0 || files.length === 0) {
          return Response.json(
            { error: "Upload at least one curriculum PDF before completing checkout." },
            { status: 400 }
          );
        }

        if (files.some((file) => !classifyPaperPlanUpload(file.name, file.type))) {
          return Response.json(
            { error: "Choose only PDF, text, or image files." },
            { status: 400 }
          );
        }

        const uploadedFiles = await Promise.all(
          files.map(async (file, index) => {
            const descriptor = fileDescriptors[index] ?? {};
            return {
              subjectIndex: Number(descriptor.subjectIndex ?? 0),
              fileIndex: index,
              filename: file.name,
              mimeType: file.type,
              bytes: new Uint8Array(await file.arrayBuffer())
            };
          })
        );

        const result = await completePlanPackIntake({
            intakeId,
            checkoutSessionId,
            draft,
            uploadedFiles
          });
        const processor = await triggerProcessorJob().catch((processorError) => {
          console.error("Could not immediately start the processor job:", processorError);
          return { triggered: false, reason: "trigger_failed" } as const;
        });
        return Response.json({ ...result, processor });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to complete plan pack.";
        if (intakeId) {
          await markPlanPackIntakeFailed({ intakeId, error: message }).catch(() => undefined);
        }
        return Response.json({ error: message }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/plan-pack/uploads/prepare" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          intakeId?: string;
          checkoutSessionId?: string;
          files?: Array<{ subjectIndex: number; fileIndex: number; filename: string; mimeType?: string; size: number }>;
        };
        if (!body.intakeId || !body.checkoutSessionId) {
          return Response.json({ error: "Missing checkout information." }, { status: 400 });
        }
        return Response.json(await preparePlanPackUploadUrls({
          intakeId: body.intakeId,
          checkoutSessionId: body.checkoutSessionId,
          files: body.files ?? []
        }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not prepare uploads." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/plan-pack/uploads/complete" && request.method === "POST") {
      try {
        const body = (await request.json()) as Parameters<typeof completePlanPackStagedUploads>[0];
        const result = await completePlanPackStagedUploads(body);
        const processor = await triggerProcessorJob().catch((processorError) => {
          console.error("Could not immediately start the processor job:", processorError);
          return { triggered: false, reason: "trigger_failed" } as const;
        });
        return Response.json({ ...result, processor });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Could not complete uploads." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/accounts/bootstrap-parent" && request.method === "POST") {
      const body = (await request.json()) as {
        userId?: string;
        email?: string;
        firstName?: string;
      };

      if (!body.userId || !body.email) {
        return Response.json(
          {
            error: "userId and email are required."
          },
          { status: 400 }
        );
      }

      const parentProfile = await ensureParentProfile({
        userId: body.userId,
        email: body.email,
        firstName: body.firstName
      });

      return Response.json(parentProfile);
    }

    if (url.pathname === "/internal/accounts/local-dev-user" && request.method === "GET") {
      const email = url.searchParams.get("email");

      if (!email) {
        return Response.json(
          {
            error: "email is required."
          },
          { status: 400 }
        );
      }

      const user = await getLocalDevUserByEmail(email);

      if (!user) {
        return Response.json(
          {
            error: "User not found."
          },
          { status: 404 }
        );
      }

      return Response.json({ user });
    }

    if (url.pathname === "/internal/accounts/sign-in-eligibility" && request.method === "GET") {
      const email = url.searchParams.get("email");
      if (!email) {
        return Response.json({ error: "email is required." }, { status: 400 });
      }
      return Response.json({ eligible: await hasParentAccountForEmail(email) });
    }

    if (url.pathname === "/internal/accounts/preferences" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) {
        return Response.json({ error: "userId is required." }, { status: 400 });
      }
      try {
        return Response.json(await getAccountPreferences(userId));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to load account preferences." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/accounts/preferences" && request.method === "PATCH") {
      const body = (await request.json()) as {
        userId?: string;
        preferredPrintPageSize?: string | null;
      };
      if (!body.userId) {
        return Response.json({ error: "userId is required." }, { status: 400 });
      }
      try {
        return Response.json(await updateAccountPreferences(body.userId, {
          preferredPrintPageSize: body.preferredPrintPageSize
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to update account preferences." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/accounts/profiles" && request.method === "GET") {
      const userId = url.searchParams.get("userId");

      if (!userId) {
        return Response.json(
          {
            error: "userId is required."
          },
          { status: 400 }
        );
      }

      const householdProfiles = await listProfilesForUser(userId);
      return Response.json({
        profiles: householdProfiles
      });
    }

    if (url.pathname === "/internal/accounts/people" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      if (!userId) return Response.json({ error: "userId is required." }, { status: 400 });
      try {
        return Response.json(await listAccountPeople(userId));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to load account members." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/accounts/people/activity" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      const profileId = url.searchParams.get("profileId");
      if (!userId || !profileId) {
        return Response.json({ error: "userId and profileId are required." }, { status: 400 });
      }
      try {
        return Response.json(await getTeacherActivity({
          requesterUserId: userId,
          teacherProfileId: profileId
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to load teacher activity." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/accounts/people/name" && request.method === "PATCH") {
      const body = (await request.json()) as { userId?: string; name?: string };
      if (!body.userId) return Response.json({ error: "userId is required." }, { status: 400 });
      try {
        return Response.json(await updateOwnAccountName({
          userId: body.userId,
          name: body.name ?? ""
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to update your name." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/accounts/invitations" && request.method === "POST") {
      const body = (await request.json()) as { userId?: string; name?: string; email?: string };
      if (!body.userId) return Response.json({ error: "userId is required." }, { status: 400 });
      try {
        return Response.json(await createAccountInvitation({
          userId: body.userId,
          name: body.name ?? "",
          email: body.email ?? ""
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to create the invitation." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/accounts/people/role" && request.method === "PATCH") {
      const body = (await request.json()) as {
        userId?: string;
        profileId?: string;
        role?: "ADMIN" | "TEACHER";
      };
      if (!body.userId || !body.profileId || !body.role) {
        return Response.json({ error: "userId, profileId, and role are required." }, { status: 400 });
      }
      try {
        return Response.json(await updateAccountMemberRole({
          userId: body.userId,
          profileId: body.profileId,
          role: body.role
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to update the account role." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/overview" && request.method === "GET") {
      const userId = url.searchParams.get("userId");

      if (!userId) {
        return Response.json(
          {
            error: "userId is required."
          },
          { status: 400 }
        );
      }

      return Response.json(await getBillingOverview(userId));
    }

    if (url.pathname === "/internal/billing/checkout" && request.method === "POST") {
      const body = (await request.json()) as {
        userId?: string;
        interval?: string;
        planTier?: string;
        successUrl?: string;
        cancelUrl?: string;
        funnelKey?: string | null;
        landingVariant?: string | null;
        funnelVisitorId?: string | null;
        funnelAttribution?: Parameters<typeof createCoreSubscriptionCheckout>[0]["funnelAttribution"];
      };

      if (!body.userId || !body.interval || !body.successUrl || !body.cancelUrl) {
        return Response.json(
          {
            error: "userId, interval, successUrl, and cancelUrl are required."
          },
          { status: 400 }
        );
      }

      try {
        return Response.json(
          await createCoreSubscriptionCheckout({
            userId: body.userId,
            interval: body.interval,
            planTier: body.planTier,
            successUrl: body.successUrl,
            cancelUrl: body.cancelUrl,
            funnelKey: body.funnelKey,
            landingVariant: body.landingVariant,
            funnelVisitorId: body.funnelVisitorId,
            funnelAttribution: body.funnelAttribution
          })
        );
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Failed to create Stripe checkout session."
          },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/public-checkout" && request.method === "POST") {
      const body = (await request.json()) as {
        interval?: string;
        planTier?: string;
        successUrl?: string;
        cancelUrl?: string;
        funnelKey?: string | null;
        landingVariant?: string | null;
        funnelVisitorId?: string | null;
        funnelAttribution?: Parameters<typeof createPublicCoreSubscriptionCheckout>[0]["funnelAttribution"];
      };

      if (!body.interval || !body.successUrl || !body.cancelUrl) {
        return Response.json(
          { error: "interval, successUrl, and cancelUrl are required." },
          { status: 400 }
        );
      }

      try {
        return Response.json(await createPublicCoreSubscriptionCheckout({
          interval: body.interval,
          planTier: body.planTier,
          successUrl: body.successUrl,
          cancelUrl: body.cancelUrl,
          funnelKey: body.funnelKey,
          landingVariant: body.landingVariant,
          funnelVisitorId: body.funnelVisitorId,
          funnelAttribution: body.funnelAttribution
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to create Stripe checkout session." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/public-checkout/complete" && request.method === "POST") {
      const body = (await request.json()) as { sessionId?: string };
      if (!body.sessionId) {
        return Response.json({ error: "sessionId is required." }, { status: 400 });
      }
      try {
        return Response.json(await completePublicCoreSubscriptionCheckout(body.sessionId));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to finish checkout." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/post-checkout-offer" && request.method === "GET") {
      const sessionId = url.searchParams.get("sessionId");
      if (!sessionId) {
        return Response.json({ error: "sessionId is required." }, { status: 400 });
      }
      try {
        return Response.json(await getFirstGradePostCheckoutOffer(sessionId));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not load the offer." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/post-checkout-offer/decision" && request.method === "POST") {
      const body = (await request.json()) as {
        sourceCheckoutSessionId?: string;
        action?: "accept_full" | "decline_full" | "accept_starter" | "decline_starter";
        successUrl?: string;
        cancelUrl?: string;
      };
      if (!body.sourceCheckoutSessionId || !body.action || !body.successUrl || !body.cancelUrl) {
        return Response.json(
          { error: "sourceCheckoutSessionId, action, successUrl, and cancelUrl are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await decideFirstGradePostCheckoutOffer({
          sourceCheckoutSessionId: body.sourceCheckoutSessionId,
          action: body.action,
          successUrl: body.successUrl,
          cancelUrl: body.cancelUrl
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not update the offer." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/funnel-one-click-offer" && request.method === "POST") {
      const body = (await request.json()) as {
        sourceCheckoutSessionId?: string;
        funnelStepId?: string;
        appBaseUrl?: string;
        cancelPath?: string;
      };
      if (!body.sourceCheckoutSessionId || !body.funnelStepId || !body.appBaseUrl || !body.cancelPath) {
        return Response.json(
          { error: "sourceCheckoutSessionId, funnelStepId, appBaseUrl, and cancelPath are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await decideFunnelOneClickOffer({
          sourceCheckoutSessionId: body.sourceCheckoutSessionId,
          funnelStepId: body.funnelStepId,
          appBaseUrl: body.appBaseUrl,
          cancelPath: body.cancelPath
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not add the offer." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/plan-pack-checkout" && request.method === "POST") {
      const body = (await request.json()) as {
        userId?: string;
        successUrl?: string;
        cancelUrl?: string;
      };

      if (!body.userId || !body.successUrl || !body.cancelUrl) {
        return Response.json(
          {
            error: "userId, successUrl, and cancelUrl are required."
          },
          { status: 400 }
        );
      }

      try {
        return Response.json(
          await createPlanPackCheckout({
            userId: body.userId,
            successUrl: body.successUrl,
            cancelUrl: body.cancelUrl
          })
        );
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Failed to create Stripe checkout session."
          },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/portal" && request.method === "POST") {
      const body = (await request.json()) as {
        userId?: string;
        returnUrl?: string;
      };

      if (!body.userId || !body.returnUrl) {
        return Response.json(
          {
            error: "userId and returnUrl are required."
          },
          { status: 400 }
        );
      }

      try {
        return Response.json(
          await createCustomerPortalSession({
            userId: body.userId,
            returnUrl: body.returnUrl
          })
        );
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Failed to create Stripe customer portal session."
          },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/change-plan" && request.method === "POST") {
      const body = (await request.json()) as {
        userId?: string;
        targetPlanTier?: string;
        returnUrl?: string;
      };
      if (!body.userId || !body.targetPlanTier || !body.returnUrl) {
        return Response.json(
          { error: "userId, targetPlanTier, and returnUrl are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await createMembershipPlanChangeSession({
          userId: body.userId,
          targetPlanTier: body.targetPlanTier,
          returnUrl: body.returnUrl
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to change membership plan." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/stripe-webhook" && request.method === "POST") {
      try {
        return Response.json(
          await handleStripeWebhook({
            body: await request.text(),
            signature: request.headers.get("stripe-signature")
          })
        );
      } catch (error) {
        return Response.json(
          {
            error: error instanceof Error ? error.message : "Failed to process Stripe webhook."
          },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/billing/electives" && request.method === "GET") {
      const userId = url.searchParams.get("userId");

      if (!userId) {
        return Response.json(
          {
            error: "userId is required."
          },
          { status: 400 }
        );
      }

      return Response.json({
        electives: await listElectiveCatalog(userId)
      });
    }

    if (url.pathname === "/internal/profiles/student" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        firstName?: string;
        birthDate?: string;
        gradeLevel?: number;
        accessPin?: string;
        avatarUrl?: string;
        uiTheme?: "playful" | "academic";
        languagePreference?: string;
        learningProfileNotes?: string;
        subjectStrengths?: Record<string, string>;
        recurringDaysOff?: number[];
        calendarTimeZone?: string;
        calendarExceptions?: Array<{
          label: string;
          exceptionKind?: "holiday" | "school_break" | "vacation" | "personal_day" | "other";
          startDate: string;
          endDate: string;
        }>;
        successUrl?: string;
        cancelUrl?: string;
      };

      if (
        !body.parentUserId ||
        !body.firstName ||
        !body.birthDate ||
        body.gradeLevel == null ||
        !body.successUrl ||
        !body.cancelUrl
      ) {
        return Response.json(
          {
            error: "parentUserId, firstName, birthDate, gradeLevel, successUrl, and cancelUrl are required."
          },
          { status: 400 }
        );
      }

      try {
        const result = await createStudentProfileWithBilling({
          parentUserId: body.parentUserId,
          successUrl: body.successUrl,
          cancelUrl: body.cancelUrl,
          student: {
            firstName: body.firstName,
            birthDate: body.birthDate,
            gradeLevel: body.gradeLevel,
            accessPin: body.accessPin,
            avatarUrl: body.avatarUrl,
            uiTheme: body.uiTheme,
            languagePreference: body.languagePreference,
            learningProfileNotes: body.learningProfileNotes,
            subjectStrengths: body.subjectStrengths,
            recurringDaysOff: body.recurringDaysOff,
            calendarTimeZone: body.calendarTimeZone,
            calendarExceptions: body.calendarExceptions
          }
        });

        return Response.json(result, { status: result.kind === "created" ? 201 : 200 });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to add the student." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/learning-profile" && request.method === "PATCH") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        learningProfileNotes?: string | null;
        subjectStrengths?: Record<string, string>;
        schoolYearStartDate?: string | null;
        schoolYearEndDate?: string | null;
        updateSchoolYear?: boolean;
      };
      if (!body.parentUserId || !body.profileId) {
        return Response.json(
          { error: "parentUserId and profileId are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await updateStudentLearningProfile({
          parentUserId: body.parentUserId,
          profileId: body.profileId,
          learningProfileNotes: body.learningProfileNotes,
          subjectStrengths: body.subjectStrengths,
          schoolYearStartDate: body.schoolYearStartDate,
          schoolYearEndDate: body.schoolYearEndDate,
          updateSchoolYear: body.updateSchoolYear
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to update student profile." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/photo/prepare" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof prepareStudentProfilePhotoUpload>[0];
        return Response.json(await prepareStudentProfilePhotoUpload(body));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not prepare the student photo upload." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/photo/complete" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof completeStudentProfilePhotoUpload>[0];
        return Response.json(await completeStudentProfilePhotoUpload(body));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not save the student photo." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/photo/discard" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof discardStudentProfilePhotoUpload>[0];
        return Response.json(await discardStudentProfilePhotoUpload(body));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not discard the student photo upload." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/sync-age" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
      };

      if (!body.parentUserId || !body.profileId) {
        return Response.json(
          {
            error: "parentUserId and profileId are required."
          },
          { status: 400 }
        );
      }

      const result = await syncStudentVocabularyToAge(body.parentUserId, body.profileId);
      return Response.json(result);
    }

    if (url.pathname === "/internal/profiles/student/streaks" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const profileId = url.searchParams.get("profileId");

      if (!parentUserId || !profileId) {
        return Response.json(
          {
            error: "parentUserId and profileId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(await getStudentStreakSettings(parentUserId, profileId));
    }

    if (url.pathname === "/internal/profiles/student/streaks" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        mode?: "daily" | "weekly";
        timeZone?: string;
        pausedWeekdays?: number[];
        pausedWeeks?: string[];
      };

      if (!body.parentUserId || !body.profileId || !body.mode) {
        return Response.json(
          {
            error: "parentUserId, profileId, and mode are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await updateStudentStreakSettings({
          parentUserId: body.parentUserId,
          profileId: body.profileId,
          mode: body.mode,
          timeZone: body.timeZone,
          pausedWeekdays: body.pausedWeekdays,
          pausedWeeks: body.pausedWeeks
        })
      );
    }

    if (url.pathname === "/internal/profiles/student/calendar" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const profileId = url.searchParams.get("profileId");
      const dateFrom = url.searchParams.get("dateFrom");
      const dateTo = url.searchParams.get("dateTo");
      if (!parentUserId || !profileId || !dateFrom || !dateTo) {
        return Response.json(
          { error: "parentUserId, profileId, dateFrom, and dateTo are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await getStudentSchoolCalendar({
          parentUserId,
          profileId,
          dateFrom,
          dateTo
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to load the school calendar." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/points" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const profileId = url.searchParams.get("profileId");
      const historyLimit = Number(url.searchParams.get("historyLimit") ?? 100);
      const historyOffset = Number(url.searchParams.get("historyOffset") ?? 0);
      if (!parentUserId || !profileId) {
        return Response.json(
          { error: "parentUserId and profileId are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await getStudentPoints({
          parentUserId,
          profileId,
          historyLimit,
          historyOffset
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to load student points." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/points" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        action?: "award" | "redeem" | "settings";
        amount?: number;
        reason?: string;
        singularName?: string;
        pluralName?: string;
        iconKey?: string;
        autoAwardLessonCompletion?: boolean;
      };
      if (!body.parentUserId || !body.profileId || !body.action) {
        return Response.json(
          { error: "parentUserId, profileId, and action are required." },
          { status: 400 }
        );
      }
      try {
        if (body.action === "award") {
          return Response.json(await awardStudentPoints({
            parentUserId: body.parentUserId,
            profileId: body.profileId,
            amount: Number(body.amount),
            reason: body.reason ?? ""
          }), { status: 201 });
        }
        if (body.action === "redeem") {
          return Response.json(await redeemStudentPoints({
            parentUserId: body.parentUserId,
            profileId: body.profileId,
            amount: Number(body.amount),
            reason: body.reason ?? ""
          }), { status: 201 });
        }
        return Response.json(await updateStudentPointSettings({
          parentUserId: body.parentUserId,
          profileId: body.profileId,
          singularName: body.singularName ?? "point",
          pluralName: body.pluralName ?? "points",
          iconKey: body.iconKey ?? "star",
          autoAwardLessonCompletion: body.autoAwardLessonCompletion === true
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to update student points." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/points/icon/prepare" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof prepareStudentPointIconUpload>[0];
        return Response.json(await prepareStudentPointIconUpload(body));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not prepare the custom point icon upload." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/points/icon/complete" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof completeStudentPointIconUpload>[0];
        return Response.json(await completeStudentPointIconUpload(body));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not save the custom point icon." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/points/icon/discard" && request.method === "POST") {
      try {
        const body = await request.json() as Parameters<typeof discardStudentPointIconUpload>[0];
        return Response.json(await discardStudentPointIconUpload(body));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Could not discard the custom point icon upload." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/calendar" && request.method === "PATCH") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        timeZone?: string;
        recurringDaysOff?: number[];
      };
      if (!body.parentUserId || !body.profileId || !Array.isArray(body.recurringDaysOff)) {
        return Response.json(
          { error: "parentUserId, profileId, and recurringDaysOff are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await updateStudentCalendarSchedule({
          parentUserId: body.parentUserId,
          profileId: body.profileId,
          timeZone: body.timeZone,
          recurringDaysOff: body.recurringDaysOff
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to update the school calendar." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/calendar" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        label?: string;
        exceptionKind?: "holiday" | "school_break" | "vacation" | "personal_day" | "other";
        startDate?: string;
        endDate?: string;
      };
      if (!body.parentUserId || !body.profileId || !body.label || !body.startDate || !body.endDate) {
        return Response.json(
          { error: "parentUserId, profileId, label, startDate, and endDate are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await createStudentCalendarException({
          parentUserId: body.parentUserId,
          profileId: body.profileId,
          label: body.label,
          exceptionKind: body.exceptionKind,
          startDate: body.startDate,
          endDate: body.endDate
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to add the calendar entry." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/calendar" && request.method === "DELETE") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        exceptionId?: string;
      };
      if (!body.parentUserId || !body.profileId || !body.exceptionId) {
        return Response.json(
          { error: "parentUserId, profileId, and exceptionId are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await deleteStudentCalendarException({
          parentUserId: body.parentUserId,
          profileId: body.profileId,
          exceptionId: body.exceptionId
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to remove the calendar entry." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/attendance" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const profileId = url.searchParams.get("profileId");
      const dateFrom = url.searchParams.get("dateFrom");
      const dateTo = url.searchParams.get("dateTo");
      const yearId = url.searchParams.get("yearId");

      if (!parentUserId || !profileId) {
        return Response.json(
          {
            error: "parentUserId and profileId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await getStudentAttendance({
          parentUserId,
          profileId,
          yearId,
          dateFrom,
          dateTo
        })
      );
    }

    if (url.pathname === "/internal/profiles/student/attendance" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        entryKind?: "plan_item" | "plan_day" | "plan_day_subject" | "manual";
        weeklyPlanItemId?: string;
        weeklyPlanId?: string;
        dayNumber?: number;
        subjectKeys?: string[];
        subjectKey?: string;
        completed?: boolean;
        learningYearId?: string | null;
        attendanceDate?: string;
        activityType?: string;
        subjectLabel?: string | null;
        title?: string;
        notes?: string | null;
        minutes?: number | null;
        extraCreditPoints?: number | null;
      };
      if (!body.parentUserId || !body.profileId || !body.entryKind) {
        return Response.json({ error: "parentUserId, profileId, and entryKind are required." }, { status: 400 });
      }
      try {
        if (body.entryKind === "plan_item") {
          if (!body.weeklyPlanItemId) {
            return Response.json({ error: "weeklyPlanItemId is required." }, { status: 400 });
          }
          return Response.json(await recordPlanItemAttendance({
            parentUserId: body.parentUserId,
            profileId: body.profileId,
            weeklyPlanItemId: body.weeklyPlanItemId,
            attendanceDate: body.attendanceDate
          }), { status: 201 });
        }
        if (body.entryKind === "plan_day") {
          if (!body.weeklyPlanId || !body.dayNumber) {
            return Response.json({ error: "weeklyPlanId and dayNumber are required." }, { status: 400 });
          }
          return Response.json(await recordPlanDayAttendance({
            parentUserId: body.parentUserId,
            profileId: body.profileId,
            weeklyPlanId: body.weeklyPlanId,
            dayNumber: body.dayNumber,
            attendanceDate: body.attendanceDate,
            subjectKeys: body.subjectKeys
          }), { status: 201 });
        }
        if (body.entryKind === "plan_day_subject") {
          if (!body.weeklyPlanId || !body.dayNumber || !body.subjectKey || typeof body.completed !== "boolean") {
            return Response.json(
              { error: "weeklyPlanId, dayNumber, subjectKey, and completed are required." },
              { status: 400 }
            );
          }
          return Response.json(await setPlanDaySubjectCompletion({
            parentUserId: body.parentUserId,
            profileId: body.profileId,
            weeklyPlanId: body.weeklyPlanId,
            dayNumber: body.dayNumber,
            subjectKey: body.subjectKey,
            completed: body.completed,
            attendanceDate: body.attendanceDate
          }), { status: 201 });
        }
        return Response.json(await createManualAttendanceEntry({
          parentUserId: body.parentUserId,
          profileId: body.profileId,
          learningYearId: body.learningYearId,
          attendanceDate: body.attendanceDate ?? new Date().toISOString().slice(0, 10),
          activityType: body.activityType ?? "other",
          subjectLabel: body.subjectLabel,
          title: body.title ?? "",
          notes: body.notes,
          minutes: body.minutes,
          extraCreditPoints: body.extraCreditPoints
        }), { status: 201 });
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Failed to record attendance." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/profiles/student/attendance" && request.method === "DELETE") {
      const body = (await request.json()) as { parentUserId?: string; profileId?: string; entryId?: string };
      if (!body.parentUserId || !body.profileId || !body.entryId) {
        return Response.json({ error: "parentUserId, profileId, and entryId are required." }, { status: 400 });
      }
      try {
        return Response.json(await deleteAttendanceEntry({
          parentUserId: body.parentUserId,
          profileId: body.profileId,
          entryId: body.entryId
        }));
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Failed to remove attendance." }, { status: 400 });
      }
    }

    if (url.pathname === "/internal/profiles/student/attendance" && request.method === "PATCH") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        entryId?: string;
        attendanceDate?: string;
        activityType?: string;
        subjectLabel?: string | null;
        title?: string;
        notes?: string | null;
        minutes?: number | null;
        extraCreditPoints?: number | null;
      };
      if (
        !body.parentUserId ||
        !body.profileId ||
        !body.entryId ||
        !body.attendanceDate ||
        !body.activityType ||
        !body.title
      ) {
        return Response.json(
          { error: "parentUserId, profileId, entryId, attendanceDate, activityType, and title are required." },
          { status: 400 }
        );
      }
      try {
        return Response.json(await updateManualAttendanceEntry({
          parentUserId: body.parentUserId,
          profileId: body.profileId,
          entryId: body.entryId,
          attendanceDate: body.attendanceDate,
          activityType: body.activityType,
          subjectLabel: body.subjectLabel,
          title: body.title,
          notes: body.notes,
          minutes: body.minutes,
          extraCreditPoints: body.extraCreditPoints
        }));
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Failed to update attendance." },
          { status: 400 }
        );
      }
    }

    if (url.pathname === "/internal/profiles/student/grades" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const profileId = url.searchParams.get("profileId");
      const yearId = url.searchParams.get("yearId");
      const subjectKey = url.searchParams.get("subjectKey");

      if (!parentUserId || !profileId) {
        return Response.json(
          {
            error: "parentUserId and profileId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await getStudentGrades({
          parentUserId,
          profileId,
          yearId,
          subjectKey
        })
      );
    }

    if (url.pathname === "/internal/profiles/student/overview" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const profileId = url.searchParams.get("profileId");

      if (!parentUserId || !profileId) {
        return Response.json(
          {
            error: "parentUserId and profileId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await getStudentOverviewMetrics({
          parentUserId,
          profileId
        })
      );
    }

    if (url.pathname === "/internal/profiles/student/grading-scheme" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        gradingScheme?: "us" | "jp";
      };

      if (
        !body.parentUserId ||
        !body.profileId ||
        (body.gradingScheme !== "us" && body.gradingScheme !== "jp")
      ) {
        return Response.json(
          {
            error: "parentUserId, profileId, and gradingScheme are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await updateStudentGradingScheme(
          body.parentUserId,
          body.profileId,
          body.gradingScheme
        )
      );
    }

    if (url.pathname === "/internal/profiles/student/curriculum" && request.method === "GET") {
      const parentUserId = url.searchParams.get("parentUserId");
      const profileId = url.searchParams.get("profileId");
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";

      if (!parentUserId || !profileId) {
        return Response.json(
          {
            error: "parentUserId and profileId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await getStudentCurriculumManagement(parentUserId, profileId, languageCode)
      );
    }

    if (url.pathname === "/internal/profiles/student/curriculum" && request.method === "POST") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        nodeId?: string;
      };

      if (!body.parentUserId || !body.profileId || !body.nodeId) {
        return Response.json(
          {
            error: "parentUserId, profileId, and nodeId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await addCurriculumToStudent(body.parentUserId, body.profileId, body.nodeId)
      );
    }

    if (url.pathname === "/internal/profiles/student/curriculum" && request.method === "DELETE") {
      const body = (await request.json()) as {
        parentUserId?: string;
        profileId?: string;
        nodeId?: string;
      };

      if (!body.parentUserId || !body.profileId || !body.nodeId) {
        return Response.json(
          {
            error: "parentUserId, profileId, and nodeId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await removeCurriculumFromStudent(body.parentUserId, body.profileId, body.nodeId)
      );
    }

    if (url.pathname === "/internal/curriculum/path" && request.method === "GET") {
      const profileId = url.searchParams.get("profileId");
      const subjectId = url.searchParams.get("subjectId");
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";

      if (!profileId || !subjectId) {
        return Response.json(
          {
            error: "profileId and subjectId are required."
          },
          { status: 400 }
        );
      }

      const nodes = await getStudentCurriculumPath(profileId, subjectId, languageCode);
      return Response.json({ nodes });
    }

    if (url.pathname === "/internal/curriculum/subjects" && request.method === "GET") {
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";
      const subjects = await listCurriculumSubjects(languageCode);
      return Response.json({ subjects });
    }

    if (url.pathname === "/internal/curriculum/programs" && request.method === "GET") {
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";
      const programs = await listCurriculumPrograms(languageCode);
      return Response.json({ programs });
    }

    if (url.pathname === "/internal/curriculum/program-subjects" && request.method === "GET") {
      const programId = url.searchParams.get("programId");
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";

      if (!programId) {
        return Response.json(
          {
            error: "programId is required."
          },
          { status: 400 }
        );
      }

      const subjects = await listCurriculumSubjectsByProgram(programId, languageCode);
      return Response.json({ subjects });
    }

    if (url.pathname === "/internal/curriculum/tree" && request.method === "GET") {
      const slug = url.searchParams.get("slug");
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";
      const parentUserId = url.searchParams.get("parentUserId") ?? undefined;

      if (!slug) {
        return Response.json(
          {
            error: "slug is required."
          },
          { status: 400 }
        );
      }

      const nodes = await getCurriculumTreeBySubjectSlug(slug, languageCode, parentUserId);

      if (nodes.length === 0) {
        return Response.json(
          {
            error: "Curriculum not found."
          },
          { status: 404 }
        );
      }

      return Response.json({ nodes });
    }

    if (url.pathname === "/internal/curriculum/node" && request.method === "GET") {
      const slug = url.searchParams.get("slug");
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";

      if (!slug) {
        return Response.json(
          {
            error: "slug is required."
          },
          { status: 400 }
        );
      }

      const node = await getNodeBySlug(slug, languageCode);

      if (!node) {
        return Response.json(
          {
            error: "Node not found."
          },
          { status: 404 }
        );
      }

      return Response.json(node);
    }

    if (url.pathname === "/internal/lessons/context" && request.method === "GET") {
      const profileId = url.searchParams.get("profileId");
      const nodeId = url.searchParams.get("nodeId");

      if (!profileId || !nodeId) {
        return Response.json(
          {
            error: "profileId and nodeId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(await getLessonContext(profileId, nodeId));
    }

    if (url.pathname === "/internal/lessons/prompt" && request.method === "GET") {
      const profileId = url.searchParams.get("profileId");
      const nodeId = url.searchParams.get("nodeId");

      if (!profileId || !nodeId) {
        return Response.json(
          {
            error: "profileId and nodeId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(await buildLessonPrompt(profileId, nodeId));
    }

    if (url.pathname === "/internal/lessons" && request.method === "GET") {
      const profileId = url.searchParams.get("profileId");
      const lessonId = url.searchParams.get("lessonId");

      if (!profileId) {
        return Response.json(
          {
            error: "profileId is required."
          },
          { status: 400 }
        );
      }

      if (lessonId) {
        const lesson = await getLessonById(profileId, lessonId);

        if (!lesson) {
          return Response.json(
            {
              error: "Lesson not found."
            },
            { status: 404 }
          );
        }

        return Response.json(lesson);
      }

      return Response.json({
        lessons: await listLessonsForProfile(profileId)
      });
    }

    if (url.pathname === "/internal/lessons" && request.method === "POST") {
      const body = (await request.json()) as {
        profileId?: string;
        nodeId?: string;
        subjectId?: string;
      };

      if (!body.profileId) {
        return Response.json(
          {
            error: "profileId is required."
          },
          { status: 400 }
        );
      }

      if (body.nodeId) {
        return Response.json(await getOrCreateLessonForNode(body.profileId, body.nodeId));
      }

      if (body.subjectId) {
        return Response.json(
          await getOrCreateNextLessonForSubject(body.profileId, body.subjectId)
        );
      }

      return Response.json(
        {
          error: "nodeId or subjectId is required."
        },
        { status: 400 }
      );
    }

    if (url.pathname === "/internal/lessons/slide-complete" && request.method === "POST") {
      const body = (await request.json()) as {
        profileId?: string;
        lessonId?: string;
        slideId?: string;
      };

      if (!body.profileId || !body.lessonId || !body.slideId) {
        return Response.json(
          {
            error: "profileId, lessonId, and slideId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await markLessonSlideCompleted({
          profileId: body.profileId,
          lessonId: body.lessonId,
          slideId: body.slideId
        })
      );
    }

    if (url.pathname === "/internal/lessons/submit" && request.method === "POST") {
      const body = (await request.json()) as {
        profileId?: string;
        lessonId?: string;
        answers?: Array<{
          questionId?: string;
          choiceIndex?: number;
        }>;
      };

      if (!body.profileId || !body.lessonId || !Array.isArray(body.answers)) {
        return Response.json(
          {
            error: "profileId, lessonId, and answers are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await submitLessonQuiz({
          profileId: body.profileId,
          lessonId: body.lessonId,
          answers: body.answers
            .filter(
              (answer): answer is { questionId: string; choiceIndex: number } =>
                Boolean(answer.questionId) && typeof answer.choiceIndex === "number"
            )
            .map((answer) => ({
              questionId: answer.questionId,
              choiceIndex: answer.choiceIndex
            }))
        })
      );
    }

    if (url.pathname === "/internal/student/classroom" && request.method === "GET") {
      const profileId = url.searchParams.get("profileId");
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";

      if (!profileId) {
        return Response.json(
          {
            error: "profileId is required."
          },
          { status: 400 }
        );
      }

      return Response.json(await getStudentClassroomData(profileId, languageCode));
    }

    if (url.pathname === "/internal/streaks/status" && request.method === "GET") {
      const profileId = url.searchParams.get("profileId");

      if (!profileId) {
        return Response.json(
          {
            error: "profileId is required."
          },
          { status: 400 }
        );
      }

      return Response.json(await getStreakStatus(profileId));
    }

    if (url.pathname === "/internal/streaks/activity" && request.method === "POST") {
      const body = (await request.json()) as {
        profileId?: string;
      };

      if (!body.profileId) {
        return Response.json(
          {
            error: "profileId is required."
          },
          { status: 400 }
        );
      }

      return Response.json(await recordActivity(body.profileId));
    }

    if (url.pathname === "/internal/locales/assets" && request.method === "GET") {
      const localeId = url.searchParams.get("localeId");

      if (!localeId) {
        return Response.json(
          {
            error: "localeId is required."
          },
          { status: 400 }
        );
      }

      return Response.json(await getLocaleAssets(localeId));
    }

    if (url.pathname === "/internal/mastery/evaluate" && request.method === "POST") {
      const body = (await request.json()) as {
        profileId?: string;
        nodeId?: string;
        score?: number;
      };

      if (!body.profileId || !body.nodeId || body.score == null) {
        return Response.json(
          {
            error: "profileId, nodeId, and score are required."
          },
          { status: 400 }
        );
      }

      return Response.json(await evaluateSession(body.profileId, body.nodeId, body.score));
    }

    if (url.pathname === "/internal/mastery/unlock" && request.method === "POST") {
      const body = (await request.json()) as {
        profileId?: string;
        nodeId?: string;
      };

      if (!body.profileId || !body.nodeId) {
        return Response.json(
          {
            error: "profileId and nodeId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(await unlockInitialSkill(body.profileId, body.nodeId));
    }

    if (url.pathname === "/internal/vocabulary/context" && request.method === "GET") {
      const profileId = url.searchParams.get("profileId");
      const nodeId = url.searchParams.get("nodeId");
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";

      if (!profileId || !nodeId) {
        return Response.json(
          {
            error: "profileId and nodeId are required."
          },
          { status: 400 }
        );
      }

      return Response.json(
        await getNodeTechnicalVocabularyContext(profileId, nodeId, languageCode)
      );
    }

    if (url.pathname === "/internal/vocabulary/whitelist" && request.method === "GET") {
      const profileId = url.searchParams.get("profileId");
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";

      if (!profileId) {
        return Response.json(
          {
            error: "profileId is required."
          },
          { status: 400 }
        );
      }

      return Response.json({
        words: await getConsumerSafeWordWhitelist(profileId, languageCode)
      });
    }

    if (url.pathname === "/internal/vocabulary/pioneer" && request.method === "GET") {
      const profileId = url.searchParams.get("profileId");
      const languageCode = url.searchParams.get("languageCode") ?? "en-US";
      const limit = Number(url.searchParams.get("limit") ?? "10");

      if (!profileId) {
        return Response.json(
          {
            error: "profileId is required."
          },
          { status: 400 }
        );
      }

      return Response.json({
        words: await getPioneerWords(profileId, limit, languageCode)
      });
    }

    return new Response("Not Found", { status: 404 });
  }
});

console.log(`ts-backend listening on ${server.url}`);
