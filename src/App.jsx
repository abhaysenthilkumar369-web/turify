import { useEffect, useMemo, useState } from 'react'
import './App.css'

const STORAGE_KEY = 'turify-progress-v2'
const ROUND_SIZE = 10

const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
const OBJECTS = ['🍎', '⭐', '🔒', '🎯', '🧩', '🔑']
const DIRECTIONS = ['up', 'right', 'down', 'left']
const DIRECTION_LABELS = {
  up: 'Up',
  right: 'Right',
  down: 'Down',
  left: 'Left',
}
const LEVELS = [
  { name: 'Beginner', minXp: 0 },
  { name: 'Thinker', minXp: 100 },
  { name: 'Solver', minXp: 300 },
  { name: 'Turify Elite', minXp: 700 },
]
const PUZZLE_LABELS = {
  dice: 'Dice Logic',
  count: 'Weighted Count',
  'target-sum': 'Constrained Sum',
  rotation: 'Transform Rotation',
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function shuffle(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function getLevelByXp(xp) {
  const sorted = [...LEVELS].sort((a, b) => a.minXp - b.minXp)
  return sorted.reduce((active, level) => (xp >= level.minXp ? level : active), sorted[0])
}

function isPrime(number) {
  if (number < 2) return false
  for (let i = 2; i * i <= number; i += 1) {
    if (number % i === 0) return false
  }
  return true
}

function getDifficultyTier(xp) {
  if (xp >= 700) return 4
  if (xp >= 300) return 3
  if (xp >= 100) return 2
  return 1
}

function rotateDirection(direction, steps) {
  const currentIndex = DIRECTIONS.indexOf(direction)
  return DIRECTIONS[(currentIndex + steps + DIRECTIONS.length) % DIRECTIONS.length]
}

function createDicePuzzle(tier) {
  const diceCount = randomInt(4 + tier, 5 + tier)
  const rolls = Array.from({ length: diceCount }, () => randomInt(1, 6))
  const oddIndexSum = rolls
    .filter((_, index) => index % 2 === 0)
    .reduce((sum, value) => sum + value, 0)
  const evenIndexSum = rolls
    .filter((_, index) => index % 2 === 1)
    .reduce((sum, value) => sum + value, 0)
  const primeRolls = rolls.filter((value) => isPrime(value)).reduce((sum, value) => sum + value, 0)
  const solution = oddIndexSum * 2 + evenIndexSum - primeRolls
  return {
    type: 'dice',
    prompt:
      'Compute: (sum of odd-position dice × 2) + (sum of even-position dice) - (sum of prime-valued dice). Positions start at 1.',
    data: { rolls },
    solution,
  }
}

function createObjectCountPuzzle(tier) {
  const totalItems = 12 + tier * 2
  const targetIcon = OBJECTS[randomInt(0, OBJECTS.length - 1)]
  const items = Array.from({ length: totalItems }, () => ({
    icon: OBJECTS[randomInt(0, OBJECTS.length - 1)],
    weight: randomInt(1, 4 + tier),
  }))
  const solution = items
    .filter((item) => item.icon === targetIcon && item.weight % 2 === 0)
    .reduce((sum, item) => sum + item.weight, 0)
  return {
    type: 'count',
    prompt: 'Add ONLY even weights of target icons. Ignore all other icons and odd weights.',
    data: { targetIcon, items },
    solution,
  }
}

function buildNonAdjacentIndexes(length, picksNeeded) {
  let indexes = []
  let safety = 0
  while (indexes.length !== picksNeeded && safety < 1000) {
    safety += 1
    const candidate = shuffle(Array.from({ length }, (_, i) => i))
      .slice(0, picksNeeded)
      .sort((a, b) => a - b)
    const nonAdjacent = candidate.every((index, idx) => idx === 0 || index - candidate[idx - 1] > 1)
    if (nonAdjacent) {
      indexes = candidate
    }
  }
  return indexes
}

function createTargetSumPuzzle(tier) {
  const numbers = Array.from({ length: 7 + tier }, () => randomInt(1, 12))
  const picksNeeded = Math.min(3 + Math.floor((tier - 1) / 2), 4)
  const chosenIndexes = buildNonAdjacentIndexes(numbers.length, picksNeeded)
  const target = chosenIndexes.reduce((sum, index) => sum + numbers[index], 0)
  return {
    type: 'target-sum',
    prompt:
      'Select exactly the required number of values. Chosen indexes must be non-adjacent and include at least one prime number.',
    data: { numbers, target, picksNeeded },
    solution: target,
  }
}

function createRotationPuzzle(tier) {
  const start = DIRECTIONS[randomInt(0, DIRECTIONS.length - 1)]
  const operationsPool = ['CW', 'CCW', 'FLIP']
  const operationCount = 2 + tier
  const operations = Array.from(
    { length: operationCount },
    () => operationsPool[randomInt(0, operationsPool.length - 1)],
  )
  let target = start
  operations.forEach((operation) => {
    if (operation === 'CW') target = rotateDirection(target, 1)
    if (operation === 'CCW') target = rotateDirection(target, -1)
    if (operation === 'FLIP') target = rotateDirection(target, 2)
  })
  return {
    type: 'rotation',
    prompt: 'Apply all transformations in order and select the final direction.',
    data: { start, operations, target, options: shuffle(DIRECTIONS) },
    solution: target,
  }
}

function createPuzzle(xp) {
  const tier = getDifficultyTier(xp)
  const generators = [
    createDicePuzzle,
    createObjectCountPuzzle,
    createTargetSumPuzzle,
    createRotationPuzzle,
  ]
  const build = generators[randomInt(0, generators.length - 1)]
  const puzzle = build(tier)
  return {
    ...puzzle,
    difficultyTier: tier,
    id: crypto.randomUUID(),
    startedAt: Date.now(),
  }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    return null
  }
}

function createInitialState() {
  return {
    theme: 'dark',
    score: 0,
    xp: 0,
    roundSolved: 0,
    attempts: 0,
    correct: 0,
    mistakes: 0,
    totalTimeMs: 0,
    sessionHistory: [],
    currentPuzzle: createPuzzle(0),
  }
}

function App() {
  const restored = loadProgress()
  const [theme, setTheme] = useState(restored?.theme ?? 'dark')
  const [score, setScore] = useState(restored?.score ?? 0)
  const [xp, setXp] = useState(restored?.xp ?? 0)
  const [roundSolved, setRoundSolved] = useState(restored?.roundSolved ?? 0)
  const [attempts, setAttempts] = useState(restored?.attempts ?? 0)
  const [correct, setCorrect] = useState(restored?.correct ?? 0)
  const [mistakes, setMistakes] = useState(restored?.mistakes ?? 0)
  const [totalTimeMs, setTotalTimeMs] = useState(restored?.totalTimeMs ?? 0)
  const [sessionHistory, setSessionHistory] = useState(restored?.sessionHistory ?? [])
  const [puzzle, setPuzzle] = useState(restored?.currentPuzzle ?? createPuzzle(restored?.xp ?? 0))
  const [numericAnswer, setNumericAnswer] = useState('')
  const [selectedIndexes, setSelectedIndexes] = useState([])
  const [selectedDirection, setSelectedDirection] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        theme,
        score,
        xp,
        roundSolved,
        attempts,
        correct,
        mistakes,
        totalTimeMs,
        sessionHistory,
        currentPuzzle: puzzle,
      }),
    )
  }, [theme, score, xp, roundSolved, attempts, correct, mistakes, totalTimeMs, sessionHistory, puzzle])

  const level = useMemo(() => getLevelByXp(xp), [xp])
  const accuracy = attempts ? (correct / attempts) * 100 : 0
  const averageTimeSeconds = correct ? totalTimeMs / correct / 1000 : 0
  const progress = (roundSolved / ROUND_SIZE) * 100

  function resetAnswerState() {
    setNumericAnswer('')
    setSelectedIndexes([])
    setSelectedDirection('')
  }

  function getIsCorrect() {
    if (puzzle.type === 'dice' || puzzle.type === 'count') {
      return Number(numericAnswer) === puzzle.solution
    }

    if (puzzle.type === 'target-sum') {
      if (selectedIndexes.length !== puzzle.data.picksNeeded) return false
      const isNonAdjacent = [...selectedIndexes]
        .sort((a, b) => a - b)
        .every((index, idx, array) => idx === 0 || index - array[idx - 1] > 1)
      if (!isNonAdjacent) return false

      const hasPrime = selectedIndexes.some((index) => isPrime(puzzle.data.numbers[index]))
      if (!hasPrime) return false

      const sum = selectedIndexes.reduce(
        (total, index) => total + puzzle.data.numbers[index],
        0,
      )
      return sum === puzzle.solution
    }

    if (puzzle.type === 'rotation') {
      return selectedDirection === puzzle.solution
    }

    return false
  }

  function handleSubmit(event) {
    event.preventDefault()

    const elapsedMs = Date.now() - puzzle.startedAt
    const valid = getIsCorrect()
    setAttempts((prev) => prev + 1)

    if (valid) {
      const elapsedSeconds = elapsedMs / 1000
      const complexityBonus = puzzle.difficultyTier * 25
      const speedBonus = Math.max(0, Math.round((45 - elapsedSeconds) * (1 + puzzle.difficultyTier * 0.4)))
      const earned = 120 + complexityBonus + speedBonus
      setCorrect((prev) => prev + 1)
      setScore((prev) => prev + earned)
      const xpGain = Math.round(30 + puzzle.difficultyTier * 20 + speedBonus / 3)
      setXp((prev) => prev + xpGain)
      setTotalTimeMs((prev) => prev + elapsedMs)
      setRoundSolved((prev) => ((prev + 1) % ROUND_SIZE))
      setSessionHistory((prev) =>
        [
          {
            id: crypto.randomUUID(),
            puzzleType: puzzle.type,
            success: true,
            delta: earned,
            timeMs: elapsedMs,
            tier: puzzle.difficultyTier,
          },
          ...prev,
        ].slice(0, 5),
      )
      setFeedback(`Correct! +${earned} points`)
      setPuzzle(createPuzzle(xp + xpGain))
      resetAnswerState()
      return
    }

    const penalty = 25 + puzzle.difficultyTier * 10
    const xpPenalty = 10 + puzzle.difficultyTier * 4
    setMistakes((prev) => prev + 1)
    setScore((prev) => Math.max(0, prev - penalty))
    setXp((prev) => Math.max(0, prev - xpPenalty))
    setSessionHistory((prev) =>
      [
        {
          id: crypto.randomUUID(),
          puzzleType: puzzle.type,
          success: false,
          delta: -penalty,
          timeMs: elapsedMs,
          tier: puzzle.difficultyTier,
        },
        ...prev,
      ].slice(0, 5),
    )
    setFeedback('Incorrect. Conditions are strict: review all constraints and retry.')
  }

  function toggleNumber(index) {
    setSelectedIndexes((prev) =>
      prev.includes(index) ? prev.filter((n) => n !== index) : [...prev, index],
    )
  }

  function resetProgress() {
    const initial = createInitialState()
    setTheme(initial.theme)
    setScore(initial.score)
    setXp(initial.xp)
    setRoundSolved(initial.roundSolved)
    setAttempts(initial.attempts)
    setCorrect(initial.correct)
    setMistakes(initial.mistakes)
    setTotalTimeMs(initial.totalTimeMs)
    setSessionHistory(initial.sessionHistory)
    setPuzzle(initial.currentPuzzle)
    setFeedback('Progress reset. Fresh puzzle loaded.')
    resetAnswerState()
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Turify</h1>
          <p>Elite analytical CAPTCHA trainer</p>
        </div>
        <button
          className="secondary-btn"
          type="button"
          onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </header>

      <section className="progress-wrap">
        <div className="progress-meta">
          <span>Puzzle progress</span>
          <span>{roundSolved}/{ROUND_SIZE}</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="score-grid">
        <article>
          <h2>{level.name}</h2>
          <p>{xp} XP</p>
        </article>
        <article>
          <h2>{score}</h2>
          <p>Score</p>
        </article>
        <article>
          <h2>{accuracy.toFixed(1)}%</h2>
          <p>Accuracy</p>
        </article>
        <article>
          <h2>{averageTimeSeconds.toFixed(1)}s</h2>
          <p>Avg time</p>
        </article>
      </section>
      <section className="history-panel">
        <h3>Session History (Last 5)</h3>
        {sessionHistory.length === 0 ? (
          <p className="history-empty">No attempts yet. Solve a puzzle to populate history.</p>
        ) : (
          <ul className="history-list">
            {sessionHistory.map((entry) => (
              <li key={entry.id} className="history-item">
                <span>{PUZZLE_LABELS[entry.puzzleType]}</span>
                <span className={entry.success ? 'entry-good' : 'entry-bad'}>
                  {entry.success ? 'Correct' : 'Miss'}
                </span>
                <span>T{entry.tier ?? 1}</span>
                <span>{entry.delta > 0 ? `+${entry.delta}` : entry.delta} pts</span>
                <span>{(entry.timeMs / 1000).toFixed(1)}s</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form className="challenge-layout" onSubmit={handleSubmit}>
        <aside className="instructions">
          <h3>Instructions</h3>
          <p>{puzzle.prompt}</p>
          <p className="difficulty-tag">Difficulty tier: {puzzle.difficultyTier}/4</p>
          <ul>
            <li>Constraints matter. A numerically right answer can still be wrong.</li>
            <li>Higher tiers give more rewards and stronger penalties.</li>
            <li>Your progress resumes automatically after refresh.</li>
          </ul>
        </aside>

        <section className="puzzle-card" aria-live="polite">
          {puzzle.type === 'dice' && (
            <>
              <p className="puzzle-title">Dice Logic</p>
              <div className="icon-row">
                {puzzle.data.rolls.map((value, index) => (
                  <span key={`${puzzle.id}-dice-${index}`} className="large-icon" title={`Value ${value}`}>
                    {DICE[value - 1]}
                  </span>
                ))}
              </div>
              <p className="helper-text">Prime dice are 2, 3, 5. Positions are 1-based.</p>
              <label className="input-label">
                Enter final computed value
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={numericAnswer}
                  onChange={(event) => setNumericAnswer(event.target.value)}
                  required
                />
              </label>
            </>
          )}

          {puzzle.type === 'count' && (
            <>
              <p className="puzzle-title">Weighted Count</p>
              <p className="target-value">Target icon: {puzzle.data.targetIcon}</p>
              <div className="count-grid">
                {puzzle.data.items.map((item, index) => (
                  <span key={`${puzzle.id}-item-${index}`} className="count-object">
                    {item.icon}
                    <small>{item.weight}</small>
                  </span>
                ))}
              </div>
              <label className="input-label">
                Sum of valid weights
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={numericAnswer}
                  onChange={(event) => setNumericAnswer(event.target.value)}
                  required
                />
              </label>
            </>
          )}

          {puzzle.type === 'target-sum' && (
            <>
              <p className="puzzle-title">Constrained Sum</p>
              <p className="target-value">Reach exactly: {puzzle.data.target}</p>
              <p className="helper-text">
                Pick exactly {puzzle.data.picksNeeded}, non-adjacent, with at least one prime value.
              </p>
              <div className="chip-grid">
                {puzzle.data.numbers.map((number, index) => (
                  <button
                    key={`${puzzle.id}-num-${index}`}
                    type="button"
                    className={`chip ${selectedIndexes.includes(index) ? 'selected' : ''}`}
                    onClick={() => toggleNumber(index)}
                  >
                    {number}
                  </button>
                ))}
              </div>
              <p className="helper-text">
                Current sum: {selectedIndexes.reduce((total, index) => total + puzzle.data.numbers[index], 0)} | Selected: {selectedIndexes.length}
              </p>
            </>
          )}

          {puzzle.type === 'rotation' && (
            <>
              <p className="puzzle-title">Transform Rotation</p>
              <p className="target-value">Start direction: {DIRECTION_LABELS[puzzle.data.start]}</p>
              <p className="helper-text">Sequence: {puzzle.data.operations.join(' → ')}</p>
              <div className="rotation-grid">
                {puzzle.data.options.map((direction) => (
                  <button
                    key={`${puzzle.id}-dir-${direction}`}
                    type="button"
                    className={`direction-btn ${selectedDirection === direction ? 'selected' : ''}`}
                    onClick={() => setSelectedDirection(direction)}
                  >
                    <span className={`arrow arrow-${direction}`} aria-hidden="true">
                      ➤
                    </span>
                    {DIRECTION_LABELS[direction]}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        <footer className="actions">
          <p className={feedback.startsWith('Correct') ? 'feedback success' : 'feedback'}>{feedback}</p>
          <div className="action-buttons">
            <button type="button" className="secondary-btn" onClick={resetProgress}>
              Reset progress
            </button>
            <button type="submit" className="primary-btn">
              Submit
            </button>
          </div>
        </footer>
      </form>
    </main>
  )
}

export default App
