"use client";

import type { Route } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { AudioFocusIndicator } from "./audio-focus-indicator";
import { submitLessonQuizAction } from "./actions";
import { initialLessonQuizState } from "./quiz-state";

type LessonQuizProps = {
  profileId?: string;
  lessonId: string;
  title: string;
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
  currentQuestionIndex: number;
  onQuestionIndexChange: (index: number) => void;
  slideCount: number;
  mode?: "student" | "preview";
  previewBackHref?: string;
  previewBackLabel?: string;
};

export function LessonQuiz({
  profileId,
  lessonId,
  title,
  questions,
  currentQuestionIndex,
  onQuestionIndexChange,
  slideCount,
  mode = "student",
  previewBackHref,
  previewBackLabel
}: LessonQuizProps) {
  const [state, formAction] = useFormState(submitLessonQuizAction, initialLessonQuizState);
  const [previewState, setPreviewState] = useState(initialLessonQuizState);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [revealedQuestionIds, setRevealedQuestionIds] = useState<string[]>([]);
  const [playingAudioKey, setPlayingAudioKey] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRef = useRef<HTMLAudioElement | null>(null);
  const answerSelectAudioRef = useRef<HTMLAudioElement | null>(null);
  const playingAudioKeyRef = useRef<string | null>(null);
  const quizPanelRef = useRef<HTMLFormElement | null>(null);
  const promptRef = useRef<HTMLDivElement | null>(null);
  const choiceRefs = useRef(new Map<string, HTMLLabelElement | null>());
  const [audioFocusRect, setAudioFocusRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [audioFocusAnimationKey, setAudioFocusAnimationKey] = useState(0);
  const safeState = mode === "preview" ? previewState : state ?? initialLessonQuizState;
  const currentQuestion = questions[currentQuestionIndex];
  const totalSteps = slideCount + questions.length + 1;
  const resultHref = (
    mode === "preview" ? previewBackHref ?? "/p/curriculums" : "/student/classroom"
  ) as Route;
  const currentStepIndex = slideCount + currentQuestionIndex;

  const selectedChoiceIndex = currentQuestion ? answers[currentQuestion.id] : undefined;
  const isRevealed = currentQuestion ? revealedQuestionIds.includes(currentQuestion.id) : false;
  const isLastQuestion = currentQuestionIndex >= questions.length - 1;
  const canReveal = selectedChoiceIndex != null && !isRevealed;

  const hiddenInputs = useMemo(
    () =>
      Object.entries(answers).map(([questionId, choiceIndex]) => (
        <input key={questionId} type="hidden" name={`question:${questionId}`} value={choiceIndex} />
      )),
    [answers]
  );

  const playAudio = useCallback(async (url: string, audioKey: string) => {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    if (media.src === url && playingAudioKeyRef.current === audioKey && !media.paused) {
      media.pause();
      setPlayingAudioKey(null);
      return;
    }

    media.pause();
    media.src = url;
    media.currentTime = 0;
    setPlayingAudioKey(audioKey);

    try {
      await media.play();
    } catch (error) {
      console.error("Failed to play quiz audio.", { audioKey, error });
      setPlayingAudioKey(null);
    }
  }, []);

  const stopQuizAudio = useCallback(() => {
    const media = mediaRef.current;
    if (!media) {
      return;
    }

    media.pause();
    media.currentTime = 0;
    setPlayingAudioKey(null);
  }, []);

  const showAudioFocus = useCallback((target: HTMLElement | null) => {
    const container = quizPanelRef.current;
    if (!container || !target) {
      setAudioFocusRect(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    setAudioFocusRect({
      top: targetRect.top - containerRect.top - 8,
      left: targetRect.left - containerRect.left - 8,
      width: targetRect.width + 16,
      height: targetRect.height + 16
    });
    setAudioFocusAnimationKey((value) => value + 1);
  }, []);

  useEffect(() => {
    playingAudioKeyRef.current = playingAudioKey;
  }, [playingAudioKey]);

  useEffect(() => {
    questions.forEach((question) => {
      if (
        !Number.isInteger(question.correctChoiceIndex) ||
        question.correctChoiceIndex < 0 ||
        question.correctChoiceIndex >= question.choices.length
      ) {
        console.error("Invalid quiz question: no valid correct answer configured.", {
          lessonId,
          questionId: question.id,
          correctChoiceIndex: question.correctChoiceIndex,
          choiceCount: question.choices.length
        });
      }
    });
  }, [lessonId, questions]);

  useEffect(() => {
    if (!currentQuestion || safeState.score != null) {
      return;
    }

    showAudioFocus(promptRef.current);
    void playAudio(currentQuestion.audio.prompt.url, `question:${currentQuestion.id}`);
  }, [currentQuestion?.audio.prompt.url, currentQuestion?.id, currentQuestionIndex, playAudio, safeState.score, showAudioFocus]);

  if (!currentQuestion) {
    return null;
  }

  function playAnswerSelectSound() {
    try {
      if (!answerSelectAudioRef.current) {
        answerSelectAudioRef.current = new Audio("/click-b.mp3");
        answerSelectAudioRef.current.preload = "auto";
      }

      answerSelectAudioRef.current.currentTime = 0;
      void answerSelectAudioRef.current.play();
    } catch (error) {
      console.error(error);
    }
  }

  function getAudioContext() {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    return audioContextRef.current;
  }

  function playToneSequence(
    tones: Array<{ frequency: number; start: number; duration: number; type: OscillatorType; gain: number }>
  ) {
    const ctx = getAudioContext();
    if (!ctx) {
      return;
    }

    const now = ctx.currentTime;
    tones.forEach((tone) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = tone.type;
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.start);
      gainNode.gain.setValueAtTime(0.0001, now + tone.start);
      gainNode.gain.exponentialRampToValueAtTime(tone.gain, now + tone.start + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.duration);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(now + tone.start);
      oscillator.stop(now + tone.start + tone.duration + 0.02);
    });
  }

  function playCorrectSound() {
    playToneSequence([
      { frequency: 660, start: 0, duration: 0.18, type: "triangle", gain: 0.08 },
      { frequency: 880, start: 0.09, duration: 0.2, type: "triangle", gain: 0.08 },
      { frequency: 1320, start: 0.18, duration: 0.24, type: "sine", gain: 0.06 }
    ]);
  }

  function playIncorrectSound() {
    playToneSequence([
      { frequency: 220, start: 0, duration: 0.2, type: "sawtooth", gain: 0.07 },
      { frequency: 160, start: 0.14, duration: 0.22, type: "sawtooth", gain: 0.07 }
    ]);
  }

  function revealCurrentAnswer() {
    if (!currentQuestion || selectedChoiceIndex == null || isRevealed) {
      return;
    }

    stopQuizAudio();
    setRevealedQuestionIds((value) => Array.from(new Set([...value, currentQuestion.id])));
    if (mode === "student" && profileId) {
      void fetch("/api/streaks/activity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          profileId
        })
      }).catch((error) => {
        console.error("Failed to record streak activity for quiz question.", error);
      });
    }

    if (selectedChoiceIndex === currentQuestion.correctChoiceIndex) {
      playCorrectSound();
      return;
    }

    playIncorrectSound();
  }

  function goNextQuestion() {
    if (isLastQuestion) {
      return;
    }

    stopQuizAudio();
    onQuestionIndexChange(Math.min(questions.length - 1, currentQuestionIndex + 1));
  }

  function submitPreviewResults() {
    const results = questions.map((question) => {
      const selectedChoiceIndex = answers[question.id];
      const isCorrect = selectedChoiceIndex === question.correctChoiceIndex;

      return {
        questionId: question.id,
        prompt: question.prompt,
        selectedChoiceIndex: selectedChoiceIndex ?? null,
        selectedChoice:
          selectedChoiceIndex != null && selectedChoiceIndex >= 0
            ? question.choices[selectedChoiceIndex] ?? null
            : null,
        correctChoiceIndex: question.correctChoiceIndex,
        correctChoice: question.choices[question.correctChoiceIndex] ?? null,
        isCorrect,
        explanation: question.explanation
      };
    });

    const correctCount = results.filter((result) => result.isCorrect).length;
    const score = Math.round((correctCount / Math.max(1, results.length)) * 100);
    const passingScore = 80;

    setPreviewState({
      error: null,
      score,
      correctCount,
      totalQuestions: results.length,
      passed: score >= passingScore,
      passingScore,
      masteryStatus: null,
      unlockedNextSkillId: null,
      attemptCount: null,
      results
    });
  }

  if (safeState.score != null) {
    return (
      <div className="space-y-6">
        <div className="site-panel rounded-[28px] px-6 py-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-earth/80">
                {mode === "preview" ? "Preview finished" : "Finished"}
              </p>
              <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-ink">
                {mode === "preview"
                  ? safeState.passed
                    ? "Lesson preview complete"
                    : "Preview complete"
                  : safeState.passed
                    ? "Skill checked"
                    : "Try this skill again"}
              </h2>
            </div>
            <div className="w-full max-w-[620px] sm:pt-1">
              <ProgressBar
                slideCount={slideCount}
                questionCount={questions.length}
                currentStepIndex={totalSteps - 1}
                doneSlideIndices={new Set(Array.from({ length: slideCount }, (_, index) => index))}
                doneQuestionIndices={new Set(Array.from({ length: questions.length }, (_, index) => index))}
              />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <ResultMetric label="Correct questions" value={`${safeState.correctCount ?? 0} / ${safeState.totalQuestions ?? 0}`} />
            <ResultMetric label="Skill learned" value={title} />
            <ResultMetric
              label="Times tested"
              value={String(mode === "preview" ? 0 : safeState.attemptCount ?? 1)}
            />
          </div>

          <div className={`mt-6 rounded-[22px] px-5 py-4 ${safeState.passed ? "bg-[#e4f0d7] text-[#3f5e2f]" : "bg-[#f6ddd8] text-[#7c3d32]"}`}>
            <p className="text-base font-semibold">
              Score: {safeState.score}% {safeState.passed ? `(${safeState.masteryStatus ?? "in progress"})` : ""}
            </p>
            <p className="mt-1 text-sm leading-[1.7]">
              Passing score: {safeState.passingScore}%.{" "}
              {mode === "preview"
                ? "Preview mode does not save progress."
                : safeState.unlockedNextSkillId
                  ? "A new skill was unlocked."
                  : ""}
            </p>
          </div>

          <div className="mt-6 flex justify-end">
            <Link
              href={resultHref}
              className="flex h-16 min-w-[220px] items-center justify-center rounded-[24px] border-4 border-[#6f8d4b] bg-[#e4f0d7] px-6 text-[24px] font-semibold text-[#36511f] transition duration-200 hover:-translate-y-1 hover:scale-105 active:translate-y-1 active:scale-95"
            >
              {mode === "preview" ? previewBackLabel ?? "Back to curriculum" : "Back to classroom"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <audio
        ref={mediaRef}
        preload="none"
        onEnded={() => {
          setPlayingAudioKey(null);
        }}
        onPause={() => {
          setPlayingAudioKey((value) => (value ? null : value));
        }}
      />
      <div className="site-panel rounded-[28px] px-6 py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-earth/80">Quiz</p>
            <h2 className="mt-2 text-[28px] font-semibold tracking-[-0.05em] text-ink">
              Question {currentQuestionIndex + 1} of {questions.length}
            </h2>
            <p className="mt-2 text-base leading-[1.7] text-ink/72">{title}</p>
          </div>
          <div className="w-full max-w-[620px] sm:pt-1">
            <ProgressBar
              slideCount={slideCount}
              questionCount={questions.length}
              currentStepIndex={currentStepIndex}
              doneSlideIndices={new Set(Array.from({ length: slideCount }, (_, index) => index))}
              doneQuestionIndices={new Set(Array.from({ length: Math.max(0, currentQuestionIndex) }, (_, index) => index))}
            />
          </div>
        </div>

        <form ref={quizPanelRef} action={formAction} className="relative mt-6 space-y-5">
          <AudioFocusIndicator rect={audioFocusRect} animationKey={audioFocusAnimationKey} />
          <input type="hidden" name="profileId" value={profileId ?? ""} />
          <input type="hidden" name="lessonId" value={lessonId} />
          {hiddenInputs}

          <fieldset className="rounded-[22px] border border-[#dec9a9] bg-[#fffaf2] p-5">
            <div className="flex items-start justify-between gap-3">
              <div ref={promptRef} className="flex-1 pr-3">
                <p className="text-[clamp(28px,2.6vw,44px)] font-semibold tracking-[-0.05em] leading-[1.15] text-ink">
                  {currentQuestion.prompt}
                </p>
              </div>
              <AudioButton
                label="Play question audio"
                isPlaying={playingAudioKey === `question:${currentQuestion.id}`}
                onClick={() => {
                  showAudioFocus(promptRef.current);
                  void playAudio(currentQuestion.audio.prompt.url, `question:${currentQuestion.id}`);
                }}
              />
            </div>
            {currentQuestion.image ? (
              <div className="mt-4 flex justify-center overflow-hidden rounded-[20px] border border-[#dec9a9] bg-white px-4 py-4">
                <img
                  src={currentQuestion.image.url}
                  alt={currentQuestion.image.alt}
                  className="h-auto max-h-[220px] w-auto max-w-full object-contain"
                />
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              {currentQuestion.choices.map((choice, choiceIndex) => {
                const isSelected = selectedChoiceIndex === choiceIndex;
                const isCorrect = currentQuestion.correctChoiceIndex === choiceIndex;
                const isWrongSelection = isRevealed && isSelected && !isCorrect;
                const choiceTone = !isRevealed
                  ? isSelected
                    ? "border-[#8b6a43] bg-[#fff4de]"
                    : "border-[#d9c6a8] bg-white"
                  : isCorrect
                    ? "border-[#8fb66a] bg-[#eef6e4]"
                    : isWrongSelection
                      ? "border-[#c97d68] bg-[#f6ddd8] opacity-80"
                      : "border-[#d9c6a8] bg-white opacity-70";
                const icon = !isRevealed ? null : isCorrect ? "✓" : isWrongSelection ? "✕" : null;
                const choiceAudio = currentQuestion.audio.choices[choiceIndex];

                return (
                  <label
                    key={`${currentQuestion.id}:${choiceIndex}`}
                    ref={(node) => {
                      choiceRefs.current.set(`${currentQuestion.id}:${choiceIndex}`, node);
                    }}
                    className={`flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3 transition-transform ${isRevealed ? "cursor-default" : "hover:-translate-y-0.5"} ${choiceTone}`}
                  >
                    <input
                      type="radio"
                      name={`visible-question:${currentQuestion.id}`}
                      value={choiceIndex}
                      className="mt-1 h-4 w-4 accent-[#7f5334]"
                      checked={isSelected}
                      onChange={() => {
                        playAnswerSelectSound();
                        setAnswers((value) => ({
                          ...value,
                          [currentQuestion.id]: choiceIndex
                        }));
                      }}
                      disabled={isRevealed || safeState.score != null}
                    />
                    <span className="flex-1 text-base leading-[1.6] text-ink">{choice}</span>
                    {choiceAudio ? (
                      <AudioButton
                        label="Play answer audio"
                        isPlaying={playingAudioKey === `choice:${currentQuestion.id}:${choiceIndex}`}
                        onClick={() => {
                          showAudioFocus(choiceRefs.current.get(`${currentQuestion.id}:${choiceIndex}`) ?? null);
                          void playAudio(choiceAudio.url, `choice:${currentQuestion.id}:${choiceIndex}`);
                        }}
                      />
                    ) : null}
                    {icon ? (
                      <span className={`text-xl font-bold ${isCorrect ? "text-[#4d7c33]" : "text-[#b64f45]"}`}>
                        {icon}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            {isRevealed ? (
              <div
                className={`mt-4 rounded-[18px] px-4 py-3 text-sm leading-[1.7] ${selectedChoiceIndex === currentQuestion.correctChoiceIndex ? "bg-[#eef6e4] text-[#3f5e2f]" : "bg-[#fbe9e4] text-[#7c3d32]"}`}
              >
                <p className="font-semibold">
                  {selectedChoiceIndex === currentQuestion.correctChoiceIndex ? "Correct" : "Not quite"}
                </p>
                <p className="mt-1">{currentQuestion.explanation}</p>
              </div>
            ) : null}
          </fieldset>

          {safeState.error ? (
            <p className="rounded-[18px] bg-[#fbe9e4] px-4 py-3 text-sm text-[#7c3d32]">{safeState.error}</p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="flex h-20 w-24 items-center justify-center rounded-[24px] border-4 border-[#d7bf98] bg-[#fffaf2] text-[44px] text-earth transition duration-200 hover:-translate-y-1 hover:scale-105 active:translate-y-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={false}
              onClick={() => {
                stopQuizAudio();
                onQuestionIndexChange(currentQuestionIndex - 1);
              }}
            >
              ←
            </button>
            {isRevealed ? (
              isLastQuestion ? (
                mode === "preview" ? (
                  <button
                    type="button"
                    className="lesson-next-attention flex h-20 min-w-[140px] items-center justify-center rounded-[24px] border-4 border-[#6f8d4b] bg-[#e4f0d7] px-5 text-[26px] font-semibold text-[#36511f] transition duration-200 hover:-translate-y-1 hover:scale-105 active:translate-y-1 active:scale-95"
                    onClick={() => {
                      submitPreviewResults();
                    }}
                  >
                    Finish
                  </button>
                ) : (
                  <SubmitButton disabled={false} />
                )
              ) : (
                <button
                  type="button"
                  className="lesson-next-attention flex h-20 min-w-[140px] items-center justify-center rounded-[24px] border-4 border-[#6f8d4b] bg-[#e4f0d7] px-5 text-[26px] font-semibold text-[#36511f] transition duration-200 hover:-translate-y-1 hover:scale-105 active:translate-y-1 active:scale-95"
                  onClick={() => {
                    goNextQuestion();
                  }}
                >
                  Next
                </button>
              )
            ) : (
              <button
                type="button"
                className={`flex h-20 min-w-[140px] items-center justify-center rounded-[24px] border-4 border-[#6f8d4b] bg-[#e4f0d7] px-5 text-[26px] font-semibold text-[#36511f] transition duration-200 hover:-translate-y-1 hover:scale-105 active:translate-y-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 ${
                  canReveal ? "lesson-next-attention" : ""
                }`}
                disabled={!canReveal}
                onClick={() => {
                  revealCurrentAnswer();
                }}
              >
                OK
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function ProgressBar({
  slideCount,
  questionCount,
  currentStepIndex,
  doneSlideIndices,
  doneQuestionIndices
}: {
  slideCount: number;
  questionCount: number;
  currentStepIndex: number;
  doneSlideIndices: Set<number>;
  doneQuestionIndices: Set<number>;
}) {
  const totalSteps = slideCount + questionCount + 1;
  const progressPercent = totalSteps > 1 ? (currentStepIndex / (totalSteps - 1)) * 100 : 0;

  return (
    <div className="relative px-2 py-2">
      <div className="absolute left-[26px] right-[26px] top-1/2 h-3 -translate-y-1/2 rounded-full bg-[#eadbc2]" />
      <div
        className="absolute left-[26px] top-1/2 h-3 -translate-y-1/2 rounded-full bg-[#8fb66a] transition-all duration-300"
        style={{ width: `calc((100% - 52px) * ${progressPercent / 100})` }}
      />
      <div className="relative flex items-center justify-between gap-2 overflow-x-auto px-2 pt-2 pb-1">
        {Array.from({ length: slideCount }).map((_, index) => {
          const isActive = currentStepIndex === index;
          const isDone = doneSlideIndices.has(index);
          const isPassed = index < currentStepIndex;
          return (
            <ProgressNode
              key={`slide-${index}`}
              label="▶"
              isActive={isActive}
              isDone={isDone}
              isPassed={isPassed}
            />
          );
        })}
        {Array.from({ length: questionCount }).map((_, index) => {
          const stepIndex = slideCount + index;
          const isActive = currentStepIndex === stepIndex;
          const isDone = doneQuestionIndices.has(index);
          const isPassed = stepIndex < currentStepIndex;
          return (
            <ProgressNode
              key={`question-${index}`}
              label="?"
              isActive={isActive}
              isDone={isDone}
              isPassed={isPassed}
            />
          );
        })}
        <ProgressNode
          key="finish"
          label="★"
          isActive={currentStepIndex === totalSteps - 1}
          isDone={currentStepIndex > totalSteps - 1}
          isPassed={totalSteps - 1 < currentStepIndex}
        />
      </div>
    </div>
  );
}

function ProgressNode({
  label,
  isActive,
  isDone,
  isPassed
}: {
  label: string;
  isActive: boolean;
  isDone: boolean;
  isPassed: boolean;
}) {
  return (
    <div className="flex min-w-[52px] items-center justify-center">
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
          {label}
        </div>
        {isDone ? (
          <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#8fb66a] text-[10px] font-bold text-white">
            ✓
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AudioButton({ label, isPlaying, onClick }: { label: string; isPlaying: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#d7bf98] bg-white text-lg text-earth transition duration-200 hover:-translate-y-0.5 hover:scale-105 active:translate-y-0.5 active:scale-95"
      onClick={onClick}
    >
      {isPlaying ? "❚❚" : "🔊"}
    </button>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[#dec9a9] bg-[#fffaf2] px-5 py-4">
      <p className="text-sm uppercase tracking-[0.18em] text-earth/70">{label}</p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.04em] text-ink">{value}</p>
    </div>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="flex h-20 min-w-[140px] items-center justify-center rounded-[24px] border-4 border-[#6f8d4b] bg-[#e4f0d7] px-5 text-[26px] font-semibold text-[#36511f] transition duration-200 hover:-translate-y-1 hover:scale-105 active:translate-y-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled || pending}
    >
      {pending ? "Checking..." : "Finish"}
    </button>
  );
}
