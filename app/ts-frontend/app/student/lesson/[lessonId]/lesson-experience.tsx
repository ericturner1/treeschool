"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AudioFocusIndicator } from "./audio-focus-indicator";
import { LessonQuiz } from "./lesson-quiz";

type LessonExperienceProps = {
  profileId?: string;
  lessonId: string;
  lessonTitle: string;
  slides: Array<{
    id: string;
    elements: Array<
      | {
          id: string;
          type: "text";
          role: "title" | "body";
          text: string;
          segments: Array<{
            text: string;
            emphasis?: "normal" | "bold";
          }>;
          frame: {
            x: number;
            y: number;
            width: number;
            height: number;
          };
        }
      | {
          id: string;
          type: "image";
          role: "primary";
          frame: {
            x: number;
            y: number;
            width: number;
            height: number;
          };
          asset: {
            url: string;
            alt: string;
            prompt: string;
          };
        }
    >;
    narrationSegments: Array<{
      id: string;
      role: "title" | "body";
      url: string;
      transcript: string;
      voiceName: string;
      languageCode: string;
    }>;
    interactions: Array<{
      id: string;
      trigger: {
        type: "tap" | "audioEnded";
        targetId: string;
      };
      actions: Array<
        | {
            type: "playAudio";
            audioId: string;
          }
        | {
            type: "markSlideComplete";
          }
      >;
    }>;
    completionRules: Array<
      | {
          type: "audioEnded";
          audioId: string;
        }
      | {
          type: "interactionCompleted";
          interactionId: string;
        }
    >;
  }>;
  completedSlideIds: string[];
  questions: Array<{
    id: string;
    prompt: string;
    choices: string[];
    correctChoiceIndex: number;
    explanation: string;
    audio: {
      prompt: {
        url: string;
        transcript: string;
        voiceName: string;
        languageCode: string;
      };
      choices: Array<{
        url: string;
        transcript: string;
        voiceName: string;
        languageCode: string;
      }>;
    };
    image?: {
      url: string;
      alt: string;
    } | null;
  }>;
  mode?: "student" | "preview";
  previewBackHref?: string;
  previewBackLabel?: string;
};

type SlideTextElement = Extract<LessonExperienceProps["slides"][number]["elements"][number], { type: "text" }>;
type SlideImageElement = Extract<LessonExperienceProps["slides"][number]["elements"][number], { type: "image" }>;

const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;

export function LessonExperience({
  profileId,
  lessonId,
  lessonTitle,
  slides,
  completedSlideIds,
  questions,
  mode = "student",
  previewBackHref,
  previewBackLabel
}: LessonExperienceProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [showQuiz, setShowQuiz] = useState(false);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSlideLoading, setIsSlideLoading] = useState(true);
  const [isImageReady, setIsImageReady] = useState(false);
  const [startedSlideIds, setStartedSlideIds] = useState<string[]>([]);
  const [doneSlideIds, setDoneSlideIds] = useState<string[]>(completedSlideIds);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const slideCanvasRef = useRef<HTMLDivElement | null>(null);
  const slideTitleRef = useRef<HTMLParagraphElement | null>(null);
  const slideBodyRef = useRef<HTMLDivElement | null>(null);
  const activeSegmentIndexRef = useRef<number>(0);
  const [audioFocusRect, setAudioFocusRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [audioFocusAnimationKey, setAudioFocusAnimationKey] = useState(0);
  const currentSlide = useMemo(() => slides[currentSlideIndex], [slides, currentSlideIndex]);
  const titleElement = currentSlide?.elements.find(
    (element): element is SlideTextElement => element.type === "text" && element.role === "title"
  );
  const bodyElement = currentSlide?.elements.find(
    (element): element is SlideTextElement => element.type === "text" && element.role === "body"
  );
  const primaryImageElement = currentSlide?.elements.find(
    (element): element is SlideImageElement => element.type === "image" && element.role === "primary"
  );
  const titleNarration = currentSlide?.narrationSegments.find((segment) => segment.role === "title") ?? null;
  const bodyNarration = currentSlide?.narrationSegments.find((segment) => segment.role === "body") ?? null;
  const bodyText = bodyElement?.text ?? "";
  const isLongBody = bodyText.length > 220;

  function renderRichText(segments: SlideTextElement["segments"]) {
    return segments.map((segment, index) => (
      <span key={index} className={segment.emphasis === "bold" ? "font-bold" : undefined}>
        {segment.text}
      </span>
    ));
  }

  useEffect(() => {
    setDoneSlideIds((value) => Array.from(new Set([...value, ...completedSlideIds])));
  }, [completedSlideIds]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    setIsSlideLoading(true);
    setIsImageReady(false);
    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
  }, [currentSlideIndex]);

  useEffect(() => {
    if (!primaryImageElement) {
      setIsImageReady(true);
    } else if (imageRef.current?.complete) {
      setIsImageReady(true);
    }
  }, [currentSlideIndex, currentSlide?.id, primaryImageElement]);

  useEffect(() => {
    const imageSatisfied = primaryImageElement ? isImageReady : true;
    setIsSlideLoading(!imageSatisfied);
  }, [isImageReady, primaryImageElement]);

  if (!currentSlide) {
    return null;
  }
  const isCurrentSlideComplete = doneSlideIds.includes(currentSlide.id);
  const hasCurrentSlideStarted = startedSlideIds.includes(currentSlide.id) || isCurrentSlideComplete;
  const controlsDisabled = isSlideLoading;

  const totalSteps = slides.length + questions.length + 1;
  const currentStepIndex = showQuiz ? slides.length + currentQuizIndex : currentSlideIndex;
  const progressPercent = totalSteps > 1 ? (currentStepIndex / (totalSteps - 1)) * 100 : 0;

  function showAudioFocus(target: HTMLElement | null) {
    const container = slideCanvasRef.current;
    if (!container || !target) {
      setAudioFocusRect(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    setAudioFocusRect({
      top: targetRect.top - containerRect.top - 10,
      left: targetRect.left - containerRect.left - 10,
      width: targetRect.width + 20,
      height: targetRect.height + 20
    });
    setAudioFocusAnimationKey((value) => value + 1);
  }

  async function markCurrentSlideCompleted() {
    if (doneSlideIds.includes(currentSlide.id)) {
      return;
    }

    setDoneSlideIds((value) => Array.from(new Set([...value, currentSlide.id])));

    if (mode === "preview" || !profileId) {
      return;
    }

    try {
      const response = await fetch("/api/lessons/slide-complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          profileId,
          lessonId,
          slideId: currentSlide.id
        })
      });

      if (!response.ok) {
        throw new Error("Failed to mark slide complete.");
      }
    } catch (error) {
      console.error(error);
    }
  }

  async function playCurrentSlide() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    setStartedSlideIds((value) => Array.from(new Set([...value, currentSlide.id])));
    const firstSegment = titleNarration ?? bodyNarration;
    if (!firstSegment) {
      return;
    }

    activeSegmentIndexRef.current = 0;
    showAudioFocus(firstSegment.role === "title" ? slideTitleRef.current : slideBodyRef.current);
    audio.src = firstSegment.url;
    audio.currentTime = 0;
    setIsPlaying(true);
    await audio.play();
  }

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      return;
    }

    void playCurrentSlide();
  }

  function goNext() {
    setIsSlideLoading(true);
    setIsImageReady(false);
    if (currentSlideIndex >= slides.length - 1) {
      setShowQuiz(true);
      setCurrentQuizIndex(0);
      return;
    }

    setCurrentSlideIndex((value) => Math.min(slides.length - 1, value + 1));
  }

  return (
    <section className="mt-0 space-y-4">
      {!showQuiz ? (
        <div className="px-0 py-0">
          <div className="overflow-hidden rounded-[28px] bg-white">
            <div ref={slideCanvasRef} className="relative aspect-[16/9] w-full overflow-hidden bg-white">
              <AudioFocusIndicator rect={audioFocusRect} animationKey={audioFocusAnimationKey} />
              <div className="absolute left-[4.5%] top-[2.5%] z-[1] max-w-[36%]">
                <p ref={slideTitleRef} className="text-[clamp(28px,2.6vw,44px)] font-semibold tracking-[-0.05em] text-ink">
                  {titleElement ? renderRichText(titleElement.segments) : lessonTitle}
                </p>
                <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-earth/80">
                  Slide {currentSlideIndex + 1} of {slides.length}
                </p>
              </div>
              <div
                ref={slideBodyRef}
                className={`absolute left-[4.5%] bottom-[11%] z-[2] max-w-[38%] max-h-[250px] overflow-y-auto pr-2 text-ink/82 ${
                  isLongBody
                    ? "text-[clamp(16px,1.55vw,24px)] leading-[1.46]"
                    : "text-[clamp(18px,1.8vw,27px)] leading-[1.55]"
                }`}
              >
                {bodyElement ? renderRichText(bodyElement.segments) : bodyText}
              </div>
              {primaryImageElement ? (
                <img
                  ref={imageRef}
                  src={primaryImageElement.asset.url}
                  alt={primaryImageElement.asset.alt}
                  className="absolute object-contain"
                  onLoad={() => {
                    setIsImageReady(true);
                  }}
                  onError={() => {
                    setIsImageReady(true);
                  }}
                  style={{
                    left: `${(primaryImageElement.frame.x / SLIDE_WIDTH) * 100}%`,
                    top: `${(primaryImageElement.frame.y / SLIDE_HEIGHT) * 100}%`,
                    width: `${(primaryImageElement.frame.width / SLIDE_WIDTH) * 100}%`,
                    height: `${(primaryImageElement.frame.height / SLIDE_HEIGHT) * 100}%`
                  }}
                />
              ) : null}
              {isSlideLoading ? (
                <div className="absolute inset-0 z-[3] flex items-center justify-center bg-[#fffaf2]/50">
                  <div className="flex items-center gap-3 rounded-full bg-white/90 px-5 py-3 shadow-[0_10px_24px_rgba(92,63,35,0.12)]">
                    <span className="lesson-loading-dot lesson-loading-dot--one" />
                    <span className="lesson-loading-dot lesson-loading-dot--two" />
                    <span className="lesson-loading-dot lesson-loading-dot--three" />
                  </div>
                </div>
              ) : null}
              <div className="absolute right-[3.5%] top-[2.5%] z-[1] w-[48%] max-w-[620px]">
                <div className="relative px-2 py-2">
                  <div className="absolute left-[26px] right-[26px] top-1/2 h-3 -translate-y-1/2 rounded-full bg-[#eadbc2]" />
                  <div
                    className="absolute left-[26px] top-1/2 h-3 -translate-y-1/2 rounded-full bg-[#8fb66a] transition-all duration-300"
                    style={{ width: `calc((100% - 52px) * ${progressPercent / 100})` }}
                  />
                  <div className="relative flex items-center justify-between gap-2 overflow-x-auto px-2 pt-2 pb-1">
                    {slides.map((slide, index) => {
                      const isActive = currentStepIndex === index;
                      const isDone = doneSlideIds.includes(slide.id);
                      const isPassed = index < currentStepIndex;
                      return (
                        <div key={slide.id} className="flex min-w-[52px] items-center justify-center">
                          <div className="relative">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full border-4 text-base ${
                                isActive
                                  ? "border-[#8fb66a] bg-white"
                                  : isPassed
                                    ? "border-[#8fb66a] bg-[#eef6e4]"
                                    : "border-[#d7bf98] bg-white"
                              }`}
                            >
                              ▶
                            </div>
                            {isDone ? (
                              <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#8fb66a] text-[10px] font-bold text-white">
                                ✓
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {questions.map((question, index) => {
                      const stepIndex = slides.length + index;
                      const isActive = currentStepIndex === stepIndex;
                      const isDone = currentStepIndex > stepIndex;
                      const isPassed = stepIndex < currentStepIndex;
                      return (
                        <div key={question.id} className="flex min-w-[52px] items-center justify-center">
                          <div className="relative">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full border-4 text-base ${
                                isActive
                                  ? "border-[#8fb66a] bg-white"
                                  : isPassed
                                    ? "border-[#8fb66a] bg-[#eef6e4]"
                                    : "border-[#d7bf98] bg-white"
                              }`}
                            >
                              ?
                            </div>
                            {isDone ? (
                              <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#8fb66a] text-[10px] font-bold text-white">
                                ✓
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex min-w-[52px] items-center justify-center">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-4 text-base ${
                          currentStepIndex >= totalSteps - 1
                            ? "border-[#8fb66a] bg-white"
                            : "border-[#d7bf98] bg-white"
                        }`}
                      >
                        ★
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <audio
            ref={audioRef}
            preload="none"
            onEnded={() => {
              const audio = audioRef.current;
              const shouldAdvanceToBody =
                activeSegmentIndexRef.current === 0 && titleNarration && bodyNarration;

              if (audio && shouldAdvanceToBody) {
                activeSegmentIndexRef.current = 1;
                showAudioFocus(slideBodyRef.current);
                audio.src = bodyNarration.url;
                audio.currentTime = 0;
                void audio.play();
                return;
              }

              setIsPlaying(false);
              void markCurrentSlideCompleted();
            }}
            onPause={() => {
              setIsPlaying(false);
            }}
            onPlay={() => {
              setIsPlaying(true);
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex h-20 w-28 items-center justify-center rounded-[24px] border-4 border-[#d7bf98] bg-[#fffaf2] text-[48px] text-earth transition duration-200 hover:-translate-y-1 hover:scale-105 active:translate-y-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:active:translate-y-0 disabled:active:scale-100"
              disabled={currentSlideIndex === 0 || controlsDisabled}
              aria-disabled={currentSlideIndex === 0 || controlsDisabled}
              aria-label="Previous slide"
              onClick={() => {
                setCurrentSlideIndex((value) => Math.max(0, value - 1));
              }}
            >
              ←
            </button>
            <button
              type="button"
              className={`flex h-20 min-w-[140px] items-center justify-center rounded-[24px] border-4 px-5 transition duration-200 active:translate-y-1 active:scale-95 ${
                !hasCurrentSlideStarted && !isCurrentSlideComplete
                  ? "lesson-play-attention border-[#6f8d4b] bg-[#e4f0d7] text-[48px] text-[#36511f] hover:-translate-y-1 hover:scale-105"
                  : "border-[#d7bf98] bg-[#fffaf2] text-[44px] text-earth hover:-translate-y-1 hover:scale-105"
              } disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:active:translate-y-0 disabled:active:scale-100`}
              disabled={controlsDisabled}
              onClick={() => {
                togglePlayback();
              }}
              aria-label={
                isPlaying ? "Pause audio" : !hasCurrentSlideStarted ? "Play audio" : "Replay audio"
              }
            >
              {isPlaying ? "❚❚" : !hasCurrentSlideStarted ? "▶" : "↻"}
            </button>
            <button
              type="button"
              className={`flex h-20 w-28 items-center justify-center rounded-[24px] border-4 border-[#6f8d4b] bg-[#e4f0d7] text-[48px] text-[#36511f] transition duration-200 hover:-translate-y-1 hover:scale-105 active:translate-y-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:active:translate-y-0 disabled:active:scale-100 ${
                isCurrentSlideComplete && !controlsDisabled ? "lesson-next-attention" : ""
              }`}
              disabled={!isCurrentSlideComplete || controlsDisabled}
              aria-disabled={!isCurrentSlideComplete || controlsDisabled}
              aria-label="Next step"
              onClick={() => {
                goNext();
              }}
            >
              →
            </button>
          </div>
        </div>
      ) : (
        <LessonQuiz
          profileId={profileId}
          lessonId={lessonId}
          title={lessonTitle}
          questions={questions}
          currentQuestionIndex={currentQuizIndex}
          onQuestionIndexChange={(index) => {
            if (index < 0) {
              setShowQuiz(false);
              setCurrentSlideIndex(Math.max(0, slides.length - 1));
              return;
            }

            setCurrentQuizIndex(index);
          }}
          slideCount={slides.length}
          mode={mode}
          previewBackHref={previewBackHref}
          previewBackLabel={previewBackLabel}
        />
      )}
    </section>
  );
}
