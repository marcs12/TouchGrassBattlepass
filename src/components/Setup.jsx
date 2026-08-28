import { useState } from 'react'
import Icon from './Icon'
import Window from './Window'

// First run: the pass is for two people, so it needs both names before
// anything else makes sense.
export default function Setup({ onStart }) {
  const [names, setNames] = useState(['', ''])
  const ready = names.every((n) => n.trim().length > 0)

  const submit = (e) => {
    e.preventDefault()
    if (!ready) return
    onStart(names.map((n) => n.trim()))
  }

  return (
    <Window title="setup">
      <header className="store__head">
        <div>
          <h2 className="store__title">Who's grinding?</h2>
          <p className="store__sub">
            The battlepass is co-op. Both of you check off your own habits, and
            everything either of you earns lands in the same shared bank.
          </p>
        </div>
      </header>

      <form className="setup" onSubmit={submit}>
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
                setNames((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
              }
            />
          </p>
        ))}

        <button type="submit" className="btn" disabled={!ready}>
          <Icon name="spark" size={15} strokeWidth="1.9" />
          Start Season 1
        </button>
      </form>
    </Window>
  )
}
