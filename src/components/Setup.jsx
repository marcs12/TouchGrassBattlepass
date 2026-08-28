import { useState } from 'react'
import Icon from './Icon'
import Window from './Window'

// First run. On a synced board this is also where the second phone comes in,
// with the household code from the first one.
export default function Setup({ mode, error, onStart, onJoin }) {
  const cloud = mode === 'cloud'
  const [tab, setTab] = useState('create')
  const [names, setNames] = useState(['', ''])
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const namesReady = names.every((n) => n.trim().length > 0)
  const codeReady = code.trim().length >= 4

  const run = async (action) => {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  const submitCreate = (e) => {
    e.preventDefault()
    if (!namesReady || busy) return
    run(() => onStart(names.map((n) => n.trim())))
  }

  const submitJoin = (e) => {
    e.preventDefault()
    if (!codeReady || busy) return
    run(() => onJoin(code.trim().toUpperCase()))
  }

  return (
    <Window title="setup">
      <header className="store__head">
        <div>
          <h2 className="store__title">Who's grinding?</h2>
          <p className="store__sub">
            The battlepass is co-op. Both of you check off your own habits, and
            everything either of you earns lands in the same shared bank.
            {cloud && ' One of you starts the board; the other joins with the code.'}
          </p>
        </div>
      </header>

      {error && (
        <p className="banner banner--warn">
          <Icon name="lock" size={16} strokeWidth="1.9" />
          {error}
        </p>
      )}

      {cloud && (
        <div className="filters" role="group" aria-label="Start or join">
          <button
            type="button"
            className={`chip ${tab === 'create' ? 'chip--on' : ''}`}
            aria-pressed={tab === 'create'}
            onClick={() => setTab('create')}
          >
            Start a board
          </button>
          <button
            type="button"
            className={`chip ${tab === 'join' ? 'chip--on' : ''}`}
            aria-pressed={tab === 'join'}
            onClick={() => setTab('join')}
          >
            Join with a code
          </button>
        </div>
      )}

      {!cloud || tab === 'create' ? (
        <form className="setup" onSubmit={submitCreate}>
          {names.map((name, i) => (
            <p className="field" key={i}>
              <label className="label" htmlFor={`player-${i}`}>
                Player {i + 1}
              </label>
              <input
                id={`player-${i}`}
                className="input"
                value={name}
                maxLength={24}
                autoComplete="off"
                placeholder={i === 0 ? 'Your name' : 'Their name'}
                onChange={(e) =>
                  setNames((prev) =>
                    prev.map((v, j) => (j === i ? e.target.value : v))
                  )
                }
              />
            </p>
          ))}

          <button type="submit" className="btn" disabled={!namesReady || busy}>
            <Icon name="spark" size={15} strokeWidth="1.9" />
            {busy ? 'Starting…' : 'Start Season 1'}
          </button>
        </form>
      ) : (
        <form className="setup" onSubmit={submitJoin}>
          <p className="field">
            <label className="label" htmlFor="code">
              Household code
            </label>
            <input
              id="code"
              className="input input--code"
              value={code}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="ABC123"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </p>

          <button type="submit" className="btn" disabled={!codeReady || busy}>
            <Icon name="spark" size={15} strokeWidth="1.9" />
            {busy ? 'Joining…' : 'Join the board'}
          </button>
        </form>
      )}
    </Window>
  )
}
