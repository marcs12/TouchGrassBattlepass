import { TIERS } from '../data/rewards'
import Icon from './Icon'

export default function RewardCard({
  reward,
  balance,
  owned,
  inCart,
  editing,
  wished,
  onAdd,
  onEdit,
  onRemove,
  onWish,
}) {
  const tier = TIERS[reward.tier] ?? TIERS.low
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

        {inCart > 0 ? (
          <span className="card__owned card__owned--cart">
            <Icon name="cart" size={12} />×{inCart}
          </span>
        ) : (
          owned > 0 && (
            <span className="card__owned">
              <Icon name="check" size={12} />×{owned}
            </span>
          )
        )}
        {editing && (
          <span className="card__tools">
            <button
              type="button"
              aria-label={`Edit ${reward.title}`}
              onClick={() => onEdit(reward)}
            >
              <Icon name="pencil" size={15} strokeWidth="1.9" />
            </button>
            <button
              type="button"
              className="card__danger"
              aria-label={`Remove ${reward.title}`}
              onClick={() => onRemove(reward.id, Boolean(reward.custom))}
            >
              <Icon name="trash" size={15} strokeWidth="1.9" />
            </button>
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

          {/* Pinning is an action, so it lives with the actions rather than
              over the artwork - where it used to sit on top of the rarity
              badge. Pinning is shared: both phones start seeing the bank
              measured against this one thing. */}
          {onWish && !editing && (
            <button
              type="button"
              className={`card__pin ${wished ? 'card__pin--on' : ''}`}
              aria-pressed={wished}
              aria-label={
                wished ? `Stop saving for ${reward.title}` : `Save for ${reward.title}`
              }
              title={wished ? 'Saving for this' : 'Save for this'}
              onClick={() => onWish(wished ? null : reward.id)}
            >
              <Icon name="target" size={15} strokeWidth="2.2" />
            </button>
          )}

          <button
            type="button"
            className="btn"
            onClick={() => onAdd(reward)}
            disabled={!affordable}
          >
            {affordable ? (
              <>
                <Icon name="cart" size={14} strokeWidth="1.9" />
                Add
              </>
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
