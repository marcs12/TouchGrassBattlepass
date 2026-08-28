import { TIERS } from '../data/rewards'
import Icon from './Icon'

export default function RewardCard({ reward, balance, owned, onRedeem }) {
  const tier = TIERS[reward.tier]
  const affordable = balance >= reward.cost
  const short = reward.cost - balance
  const progress = Math.min(100, Math.round((balance / reward.cost) * 100))

  return (
    <article
      className={`card ${affordable ? '' : 'card--locked'}`}
      style={{ '--h': reward.hue, '--tier': tier.color }}
    >
      <div className="card__art">
        <Icon name={reward.icon} size={54} strokeWidth="1.9" />
        <span className="card__tier">{tier.label}</span>
        {owned > 0 && (
          <span className="card__owned">
            <Icon name="check" size={11} />×{owned}
          </span>
        )}
      </div>

      <div className="card__body">
        <h3 className="card__title">{reward.title}</h3>
        <p className="card__desc">{reward.description}</p>

        {!affordable && (
          <div className="card__progress">
            <div
              className="meter"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress toward ${reward.title}`}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <span className="card__progress-text">
              {progress}% · {short.toLocaleString()} to go
            </span>
          </div>
        )}

        <div className="card__footer">
          <p className="card__price">
            <span className="card__cost">{reward.cost.toLocaleString()}</span>
            <span className="card__unit">pts</span>
          </p>

          <button
            type="button"
            className="btn"
            onClick={() => onRedeem(reward)}
            disabled={!affordable}
          >
            {affordable ? (
              'Redeem'
            ) : (
              <>
                <Icon name="lock" size={13} />
                Locked
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  )
}
