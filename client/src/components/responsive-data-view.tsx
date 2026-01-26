import { ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface DataColumn<T> {
  key: string;
  header: string;
  cell: (item: T) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
  hideOnMobile?: boolean;
  priority?: number;
}

export interface DataAction<T> {
  label: string;
  icon?: ReactNode;
  onClick: (item: T) => void;
  variant?: 'default' | 'destructive';
  hidden?: (item: T) => boolean;
}

interface ResponsiveDataViewProps<T> {
  data: T[];
  columns: DataColumn<T>[];
  actions?: DataAction<T>[];
  keyExtractor: (item: T) => string;
  cardTitle?: (item: T) => ReactNode;
  cardSubtitle?: (item: T) => ReactNode;
  cardContent?: (item: T) => ReactNode;
  emptyState?: ReactNode;
  isLoading?: boolean;
  className?: string;
  forceMode?: 'table' | 'cards';
}

export function ResponsiveDataView<T>({
  data,
  columns,
  actions = [],
  keyExtractor,
  cardTitle,
  cardSubtitle,
  cardContent,
  emptyState,
  isLoading,
  className,
  forceMode,
}: ResponsiveDataViewProps<T>) {
  const layout = useLayoutMode();

  const useCards = forceMode === 'cards' || 
    (forceMode !== 'table' && (layout.isCompact || layout.isSquare));

  if (isLoading) {
    return (
      <div className={cn("animate-pulse space-y-4", className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={cn("text-center py-12", className)}>
        {emptyState || (
          <p className="text-muted-foreground">No data available</p>
        )}
      </div>
    );
  }

  const visibleActions = (item: T) => 
    actions.filter(action => !action.hidden?.(item));

  if (useCards) {
    return (
      <div className={cn("space-y-3", className)} data-testid="data-view-cards">
        {data.map((item) => {
          const itemActions = visibleActions(item);
          const priorityColumns = columns
            .filter(col => !col.hideOnMobile)
            .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
            .slice(0, 4);

          return (
            <Card key={keyExtractor(item)} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {cardTitle ? (
                      <CardTitle className="text-base truncate">
                        {cardTitle(item)}
                      </CardTitle>
                    ) : priorityColumns[0] && (
                      <CardTitle className="text-base truncate">
                        {priorityColumns[0].cell(item)}
                      </CardTitle>
                    )}
                    {cardSubtitle && (
                      <CardDescription className="truncate">
                        {cardSubtitle(item)}
                      </CardDescription>
                    )}
                  </div>
                  
                  {itemActions.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {itemActions.map((action, idx) => (
                          <DropdownMenuItem
                            key={idx}
                            onClick={() => action.onClick(item)}
                            className={action.variant === 'destructive' ? 'text-destructive' : ''}
                          >
                            {action.icon && <span className="mr-2">{action.icon}</span>}
                            {action.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                {cardContent ? cardContent(item) : (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {priorityColumns.slice(1).map((col) => (
                      <div key={col.key}>
                        <span className="text-muted-foreground text-xs block">
                          {col.header}
                        </span>
                        <span className={col.cellClassName}>
                          {col.cell(item)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("rounded-md border overflow-auto", className)} data-testid="data-view-table">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead 
                key={col.key} 
                className={cn(
                  col.headerClassName,
                  col.hideOnMobile && "hidden md:table-cell"
                )}
              >
                {col.header}
              </TableHead>
            ))}
            {actions.length > 0 && (
              <TableHead className="w-[50px]" />
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => {
            const itemActions = visibleActions(item);
            return (
              <TableRow key={keyExtractor(item)}>
                {columns.map((col) => (
                  <TableCell 
                    key={col.key}
                    className={cn(
                      col.cellClassName,
                      col.hideOnMobile && "hidden md:table-cell"
                    )}
                  >
                    {col.cell(item)}
                  </TableCell>
                ))}
                {actions.length > 0 && (
                  <TableCell>
                    {itemActions.length > 0 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {itemActions.map((action, idx) => (
                            <DropdownMenuItem
                              key={idx}
                              onClick={() => action.onClick(item)}
                              className={action.variant === 'destructive' ? 'text-destructive' : ''}
                            >
                              {action.icon && <span className="mr-2">{action.icon}</span>}
                              {action.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
