import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const TASKS = [
  { id: 1, project: 'Website Redesign', task: 'Wireframes', start: 1, duration: 5, color: 'bg-primary' },
  { id: 2, project: 'Website Redesign', task: 'Design', start: 4, duration: 8, color: 'bg-primary' },
  { id: 3, project: 'Website Redesign', task: 'Development', start: 10, duration: 10, color: 'bg-primary' },
  { id: 4, project: 'Mobile App MVP', task: 'Requirements', start: 1, duration: 4, color: 'bg-blue-500' },
  { id: 5, project: 'Mobile App MVP', task: 'Prototyping', start: 4, duration: 6, color: 'bg-blue-500' },
  { id: 6, project: 'Mobile App MVP', task: 'Development', start: 9, duration: 14, color: 'bg-blue-500' },
  { id: 7, project: 'Brand Identity', task: 'Research', start: 2, duration: 3, color: 'bg-yellow-500' },
  { id: 8, project: 'Brand Identity', task: 'Concepts', start: 5, duration: 5, color: 'bg-yellow-500' },
  { id: 9, project: 'E-commerce Platform', task: 'Planning', start: 1, duration: 3, color: 'bg-muted-foreground' },
  { id: 10, project: 'E-commerce Platform', task: 'Backend', start: 3, duration: 8, color: 'bg-muted-foreground' },
  { id: 11, project: 'E-commerce Platform', task: 'Frontend', start: 7, duration: 9, color: 'bg-muted-foreground' },
];

const TOTAL_WEEKS = 24;
const weeks = Array.from({ length: TOTAL_WEEKS }, (_, i) => `W${i + 1}`);

export default function GanttPage() {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gantt Chart</h1>
        <Badge variant="outline" className="text-xs">24-week view</Badge>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-muted-foreground">Project Timeline</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs min-w-[900px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-2 w-48 text-muted-foreground font-medium sticky left-0 bg-card z-10">Task</th>
                {weeks.map(w => (
                  <th key={w} className="text-center py-2 px-0.5 text-muted-foreground font-medium w-8">{w}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TASKS.map((task, i) => (
                <tr key={task.id} className={`border-b border-border ${i % 2 === 0 ? 'bg-card' : 'bg-muted/20'}`}>
                  <td className="px-4 py-2 sticky left-0 bg-inherit z-10">
                    <div className="font-medium text-foreground truncate">{task.task}</div>
                    <div className="text-muted-foreground truncate">{task.project}</div>
                  </td>
                  {weeks.map((_, wi) => {
                    const weekNum = wi + 1;
                    const isStart = weekNum === task.start;
                    const isInBar = weekNum >= task.start && weekNum < task.start + task.duration;
                    const isEnd = weekNum === task.start + task.duration - 1;
                    return (
                      <td key={wi} className="py-2 px-0.5">
                        {isInBar && (
                          <div className={`h-5 ${task.color} ${isStart ? 'rounded-l-md' : ''} ${isEnd ? 'rounded-r-md' : ''} opacity-85`} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}