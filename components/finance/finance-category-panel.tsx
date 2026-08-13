import { formatFinanceCurrency } from "@/components/finance/finance-formatters";
import { FinanceCategoryIcon } from "@/components/finance/finance-icons";
import { FinancePanel } from "@/components/finance/finance-panel";
import type { FinanceCommandCenterCategorySpending } from "@/lib/jarvis/finance/load-finance-command-center";

type FinanceCategoryPanelProps = {
  categories: FinanceCommandCenterCategorySpending[];
};

export function FinanceCategoryPanel({ categories }: FinanceCategoryPanelProps) {
  return (
    <FinancePanel title="Spending by category" icon={<FinanceCategoryIcon />}>
      {categories.length === 0 ? (
        <div className="finance-empty-state">
          <span className="finance-empty-state-icon" aria-hidden="true">
            <FinanceCategoryIcon />
          </span>
          <p className="finance-empty-state-title">No category spending yet</p>
          <p className="finance-empty-state-copy">
            Posted expenses for this month will appear here once transactions are
            synced.
          </p>
        </div>
      ) : (
        <>
          <ul className="finance-category-list">
            {categories.map((category) => {
              const maxAmount = categories[0]?.amount ?? 1;

              return (
                <li
                  key={category.categoryId ?? "uncategorized"}
                  className="finance-category-row"
                >
                  <div className="finance-category-row-header">
                    <span className="finance-category-name">{category.name}</span>
                    <span className="finance-category-amount">
                      {formatFinanceCurrency(category.amount)}
                      <em>{category.sharePercent}%</em>
                    </span>
                  </div>
                  <div className="finance-category-bar" aria-hidden="true">
                    <span
                      className="finance-category-bar-fill"
                      style={{
                        width: `${Math.max(4, (category.amount / maxAmount) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="finance-category-footnote">
            Top categories for the current calendar month.
          </p>
        </>
      )}
    </FinancePanel>
  );
}
