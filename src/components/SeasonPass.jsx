import { SEASON_XP_TOTAL, TIERS_TRACK, nextTier, seasonName, tierAt } from '../data/season'
import { useCountUp } from '../lib/useCountUp'
import Icon from './Icon'
import Pane from './Pane'
import Progress from './Progress'
import WeekShelf from './WeekShelf'
import Window from './Window'

function Tier({ tier, xp, claimed, onClaim }) {
  const unlocked = xp >= tier.xp
  const state = claimed ? 'claimed' : unlocked ? 'ready' : 'locked'
  const progress = Math.min(100, Math.round((xp / tier.xp) * 100))

  return (
    <li className={`tier tier--${state}`}>
      <p className="tier__no label">Tier {tier.n}</p>

      <span className="tier__art" aria-hidden="true">
        <Icon name={tier.icon} size={24} strokeWidth="1.9" />
      </span>

      <strong className="tier__title">{tier.title}</strong>
      <p className="tier__note">{tier.note}</p>

      <p className="tier__req label">
        {tier.xp.toLocaleString()} XP
        {!unlocked && ` · ${progress}%`}
      </p>

      <button
        type="button"
        className="btn tier__btn"
        disabled={!unlocked || claimed}
        onClick={() => onClaim(tier)}
      >
        {claimed ? (
          <>
            <Icon name="check" size={13} strokeWidth="2.4" />
            Claimed
          </>
        ) : unlocked ? (
          'Claim'
        ) : (
          <>
            <Icon name="lock" size={13} />
            Locked
          </>
        )}
      </button>
    </li>
  )
}

const finishedOn = (iso) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

export default function SeasonPass({
  season,
  pastSeasons,
  history,
  members,
  grind,
  weeks,
  onOpenRecap,
  onEndSeason,
  onClaimTier,
}) {
  const xp = season.xp
  const number = season.n ?? 1
  const shownXp = useCountUp(xp)
  const claimed = new Set(season.claimed)
  const current = tierAt(xp)
  const next = nextTier(xp)

  // Progress across the current tier band, not from zero - otherwise the bar
  // barely moves once the thresholds get big.
  const bandStart = current === 0 ? 0 : TIERS_TRACK[current - 1].xp
  const bandProgress = next
    ? Math.round(((xp - bandStart) / (next.xp - bandStart)) * 100)
    : 100

  const readyCount = TIERS_TRACK.filter(
    (t) => xp >= t.xp && !claimed.has(t.n)
  ).length

  // The track is finished, so the next season is available - but not until the
  // tiers already earned have been taken. Rolling over resets the claims, and
  // walking away from a bonus you earned is not a thing to let someone do by
  // accident.
  const finished = xp >= SEASON_XP_TOTAL
  const owed = readyCount > 0

  return (
    <Window title="season-pass">
      <header className="store__head">
        <div>
          <h2 className="store__title">{seasonName(number)} Pass</h2>
          <p className="store__sub">
            Every point earned in the Daily Grind is season XP. Spending in the
            store never costs you track progress — the pass only moves forward.
          </p>
        </div>

        <div className="nextup">
          <p className="label">{current === 0 ? 'Not started' : `Tier ${current}`}</p>
          <p className="nextup__title">
            {shownXp.toLocaleString()} XP earned
          </p>
          <div
            className="meter"
            role="progressbar"
            aria-valuenow={bandProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={next ? `Progress to tier ${next.n}` : 'Season complete'}
          >
            <span style={{ '--fill': `${bandProgress}%` }} />
          </div>
          <p className="nextup__hint">
            {next ? (
              <>
                <strong>{(next.xp - xp).toLocaleString()}</strong> XP to tier{' '}
                {next.n}
              </>
            ) : (
              'Track finished. Every tier unlocked.'
            )}
          </p>
        </div>
      </header>

      {finished && (
        <Pane title="season-complete" tone="b">
          <div className="rollover">
            <span className="rollover__art" aria-hidden="true">
              <Icon name="trophy" size={26} strokeWidth="1.9" />
            </span>
            <p className="label">Track finished</p>
            <h3 className="rollover__title">
              {seasonName(number)}, all twelve tiers
            </h3>
            <p className="rollover__note">
              {xp.toLocaleString()} XP earned. Rolling over resets the track and
              nothing else — the bank, the coupons, your streaks and every
              Sunday stay exactly where they are.
            </p>
            <button
              type="button"
              className="btn"
              disabled={owed}
              onClick={onEndSeason}
            >
              {owed
                ? `Claim your last ${readyCount} tier${readyCount > 1 ? 's' : ''} first`
                : `Start ${seasonName(number + 1)}`}
            </button>
          </div>
        </Pane>
      )}

      <Pane title="progress.chart" tone="c">
        <Progress history={history} members={members} goalDates={grind?.goalDates} />
      </Pane>

      {weeks.some((w) => w.status === 'settled') && (
        <Pane title="sundays — newest first" tone="e" flush>
          <WeekShelf weeks={weeks} members={members} onOpen={onOpenRecap} />
        </Pane>
      )}

      {pastSeasons.length > 0 && (
        <Pane title="seasons — newest first" tone="a" flush>
          <section className="shelf" aria-label="Past seasons">
            <h3 className="habits__title label">Seasons · newest first</h3>
            <ul className="shelf__list">
              {pastSeasons.map((past) => (
                <li key={past.n}>
                  <div className="shelf__card shelf__card--still">
                    <span className="shelf__art" aria-hidden="true">
                      <Icon name="trophy" size={20} strokeWidth="1.9" />
                    </span>
                    <span className="shelf__meta">
                      <strong>{seasonName(past.n)}</strong>
                      <span className="label">
                        {past.endedAt ? `Finished ${finishedOn(past.endedAt)}` : 'Finished'}
                      </span>
                    </span>
                    <span className="shelf__scores label">
                      {past.xp.toLocaleString()} XP
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </Pane>
      )}

      {readyCount > 0 && (
        <p className="banner">
          <Icon name="gift" size={18} strokeWidth="1.9" />
          {readyCount} tier{readyCount > 1 ? 's' : ''} ready to claim.
        </p>
      )}

      <Pane title={`season-${number}.pass`} tone="d" flush>
      <ol className="track">
        {TIERS_TRACK.map((tier) => (
          <Tier
            key={tier.n}
            tier={tier}
            xp={xp}
            claimed={claimed.has(tier.n)}
            onClaim={onClaimTier}
          />
        ))}
      </ol>
      </Pane>
    </Window>
  )
}
