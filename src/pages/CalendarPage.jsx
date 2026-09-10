import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isToday } from 'date-fns';

const SAMPLE_EVENTS = [
  { date: '2026-05-15', label: 'Website Redesign deadline', color: 'bg-primary' },
  { date: '2026-05-20', label: 'Client meeting - Acme', color: 'bg-blue-500' },
  { date: '2026-05-27', label: 'Mobile App review', color: 'bg-green-500' },
  { date: '2026-06-05', label: 'Brand Identity check-in', color: 'bg-yellow-500' },
];

export default function CalendarPage() {
  const [current, setCurrent] = useState(new Date());

  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const days = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const getEvents = (d) => SAMPLE_EVENTS.filter(e => e.date === format(d, 'yyyy-MM-dd'));

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrent(subMonths(current, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold w-36 text-center">{format(current, 'MMMM yyyy')}</span>
          <Button variant="outline" size="icon" onClick={() => setCurrent(addMonths(current, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        {/* Day labels */}
        <div className="grid grid-cols-7 border-b border-border">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const events = getEvents(d);
            const inMonth = isSameMonth(d, current);
            const today = isToday(d);
            return (
              <div
                key={i}
                className={`min-h-[60px] sm:min-h-[80px] p-1 sm:p-1.5 border-b border-r border-border ${!inMonth ? 'opacity-30' : ''}`}
              >
                <span className={`text-xs font-medium inline-flex h-6 w-6 items-center justify-center rounded-full mb-1 ${today ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                  {format(d, 'd')}
                </span>
                <div className="space-y-0.5">
                  {events.map((e, ei) => (
                    <div key={ei} className={`text-[10px] px-1.5 py-0.5 rounded text-white truncate ${e.color}`}>
                      {e.label}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}