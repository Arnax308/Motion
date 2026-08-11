from datetime import datetime, timedelta
from typing import Dict, List, Optional
from collections import defaultdict

class ProductivityAnalytics:
    def __init__(self, data: dict):
        self.data = data

    def get_title(self, pp: int) -> str:
        """Get user title based on PP"""
        if pp <= 100:
            return "Casual Rookie 🐣"
        elif pp <= 300:
            return "Disciplined Doer 🔨"
        elif pp <= 600:
            return "Momentum Builder 🔥"
        elif pp <= 1200:
            return "Versatile Grinder ⚡"
        else:
            return "Life Prodigy 🌟"
    
    def get_severity_multiplier(self, severity: str) -> int:
        """Get PP loss multiplier based on severity"""
        return {
            'low': 1,
            'med': 2,
            'high': 5
        }.get(severity, 2)
    
    def calculate_potential_pp(self) -> int:
        """Calculate potential PP from all active tasks if completed on time with bonus"""
        potential_pp = self.data['total_pp']  # Start with current PP
        
        for task in self.data['active_tasks']:
            base_pp = task['base_pp']
            deadline = datetime.fromisoformat(task['deadline'])
            now = datetime.now()
            
            # If we can still complete it more than 1 hour before deadline, we get bonus
            if now < deadline - timedelta(hours=1):
                potential_pp += base_pp * 2  # Bonus PP
            elif now <= deadline:
                potential_pp += base_pp  # Regular PP
            else:
                potential_pp += max(1, base_pp // 2)  # Reduced PP for overdue
        
        return potential_pp
    
    def update_streak(self):
        """Update streak based on completion date"""
        today = datetime.now().date()
        
        if self.data['last_completion_date']:
            last_date = datetime.fromisoformat(self.data['last_completion_date']).date()
            
            if last_date == today:
                return
            elif last_date == today - timedelta(days=1):
                self.data['streak'] += 1
            else:
                self.data['streak'] = 1
        else:
            self.data['streak'] = 1
        
        self.data['last_completion_date'] = today.isoformat()
    

    def group_tasks_by_category(self):
        """Group active tasks by category"""
        grouped = defaultdict(list)
        for task in self.data['active_tasks']:
            grouped[task['category']].append(task)
        return dict(grouped)
    
    def group_history_by_date(self):
        """Group history entries by date"""
        grouped = defaultdict(list)
        for entry in self.data['history']:
            completion_date = datetime.fromisoformat(entry['completion_time']).date()
            grouped[completion_date].append(entry)
        return dict(grouped)
    
    def get_monthly_stats(self, year: int, month: int):
        """Get statistics for a specific month"""
        month_start = datetime(year, month, 1)
        if month == 12:
            month_end = datetime(year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = datetime(year, month + 1, 1) - timedelta(days=1)
        
        month_history = []
        for entry in self.data['history']:
            entry_date = datetime.fromisoformat(entry['completion_time'])
            if month_start <= entry_date <= datetime.combine(month_end.date(), datetime.max.time()):
                month_history.append(entry)
        
        # Calculate stats - excluding deferred tasks from totals as requested
        total_possible_pp = sum(entry.get('base_pp', 0) for entry in month_history if entry['status'] != 'deferred')
        
        category_stats = defaultdict(lambda: {'completed': 0, 'missed': 0, 'total': 0})
        for entry in month_history:
            if entry['status'] != 'deferred':  # Exclude deferred from stats
                category = entry['category']
                status = entry['status']
                category_stats[category][status] += 1
                category_stats[category]['total'] += 1
        
        # Calendar data for lazy days - only count completed/missed tasks
        calendar_data = {}
        daily_activity = defaultdict(list)
        for entry in month_history:
            if entry['status'] != 'deferred':  # Exclude deferred from calendar
                entry_date = datetime.fromisoformat(entry['completion_time']).date()
                daily_activity[entry_date].append(entry)
        
        # Mark days as productive/lazy based on task completion ratio
        for day in range(1, month_end.day + 1):
            day_date = datetime(year, month, day).date()
            if day_date in daily_activity:
                day_entries = daily_activity[day_date]
                completed = sum(1 for e in day_entries if e['status'] == 'completed')
                total = len(day_entries)
                if total > 0:
                    completion_ratio = completed / total
                    if completion_ratio >= 0.7:
                        calendar_data[day] = 'productive'
                    elif completion_ratio >= 0.3:
                        calendar_data[day] = 'average'
                    else:
                        calendar_data[day] = 'lazy'
                else:
                    calendar_data[day] = 'no_data'
            else:
                calendar_data[day] = 'no_data'
        
        return {
            'total_possible_pp': total_possible_pp,
            'category_stats': dict(category_stats),
            'calendar_data': calendar_data,
            'month_history': month_history
        }
    
