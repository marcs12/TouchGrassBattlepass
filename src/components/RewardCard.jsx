import { TIERS } from '../data/rewards'

export default function RewardCard({ reward, balance, owned, onRedeem }) {
  const tier = TIERS[reward.tier]
  const affordable = balance >= reward.cost
  const short = reward.cost - balance

  return (
    <article className="card">
      <div className="card__art" style={{ background: reward.art }}>
        <span className="card__emoji" role="img" aria-label={reward.title}>
          {reward.emoji}
        </span>
        <span className="card__tier" style={{ '--tier': tier.color }}>
          {tier.label}
        </span>
        {owned > 0 && <span className="card__owned">×{owned} redeemed</span>}
      </div>

      <div className="card__body">
        <h3 className="card__title">{reward.title}</h3>
        <p className="card__desc">{reward.description}</p>

        <div className="card__footer">
          <div className="card__price">
            <span className="card__coin" aria-hidden="true">◆</span>
            <span className="card__cost">{reward.cost.toLocaleString()}</span>
            <span className="card__unit">pts</span>
          </div>

          <button
            className="btn btn--redeem"
            onClick={() => onRedeem(reward)}
            disabled={!affordable}
          >
            {affordable ? 'Redeem' : `Need ${short.toLocaleString()}`}
          </button>
        </div>
      </div>
    </article>
  )
}
