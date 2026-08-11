import flet as ft
import json
import os
from datetime import datetime, timedelta, date, time
from typing import Dict, List, Optional
from collections import defaultdict, Counter
import calendar
from uuid import uuid4
from data_manager import load_data, save_data
from analytics import ProductivityAnalytics

class ProductivityApp:
    def __init__(self):
        self.data_file = "data.json"
        self.data = load_data(self.data_file)
        self.analytics = ProductivityAnalytics(self.data)
        self.page = None
        self.active_tasks_column = None
        self.history_column = None
        self.stats_container = None
        self.stats_page_container = None
        self.task_title_field = None
        self.task_category_dropdown = None
        self.task_pp_field = None
        self.task_severity_dropdown = None
        self.deadline_date_picker = None
        self.deadline_time_picker = None
        self.selected_date = None
        self.selected_time = None

        # Attributes for UI controls that need to be accessed across methods
        self.date_button = None
        self.time_button = None
        
        # Stats navigation
        self.current_stats_month = datetime.now().month
        self.current_stats_year = datetime.now().year

    def complete_task(self, task_id: str):
        """Mark task as completed and calculate PP"""
        task = None
        for i, t in enumerate(self.data['active_tasks']):
            if t['id'] == task_id:
                task = self.data['active_tasks'].pop(i)
                break
        
        if not task:
            return
        
        now = datetime.now()
        deadline = datetime.fromisoformat(task['deadline'])
        base_pp = task['base_pp']
        
        if now < deadline - timedelta(hours=1):
            earned_pp = base_pp * 2
        elif now <= deadline:
            earned_pp = base_pp
        else:
            earned_pp = max(1, base_pp // 2)

        # If the task was rescheduled, halve the earned PP
        if task.get('rescheduled', False):
            earned_pp = max(1, earned_pp // 2)
        
        self.data['total_pp'] += earned_pp
        self.analytics.update_streak()
        
        history_entry = {
            'title': task['title'],
            'category': task['category'],
            'severity': task.get('severity', 'med'),
            'deadline': task['deadline'],
            'completion_time': now.isoformat(),
            'pp_earned': earned_pp,
            'base_pp': task['base_pp'],
            'status': 'completed'
        }
        self.data['history'].append(history_entry)
        
        save_data(self.data_file, self.data)
        self.refresh_ui()
        self.show_snackbar(f"Task completed! Earned {earned_pp} PP! ✨")
    
    def miss_task(self, task_id: str):
        """Mark task as missed with severity-based PP loss"""
        task = None
        for i, t in enumerate(self.data['active_tasks']):
            if t['id'] == task_id:
                task = self.data['active_tasks'].pop(i)
                break
        
        if not task:
            return
        
        severity_multiplier = self.analytics.get_severity_multiplier(task.get('severity', 'med'))
        pp_loss = severity_multiplier
        
        self.data['total_pp'] = max(0, self.data['total_pp'] - pp_loss)
        
        history_entry = {
            'title': task['title'],
            'category': task['category'],
            'severity': task.get('severity', 'med'),
            'deadline': task['deadline'],
            'completion_time': datetime.now().isoformat(),
            'pp_earned': -pp_loss,
            'base_pp': task['base_pp'],
            'status': 'missed'
        }
        self.data['history'].append(history_entry)
        
        save_data(self.data_file, self.data)
        self.refresh_ui()
        self.show_snackbar(f"Task missed. Lost {pp_loss} PP.")
    
    def defer_task(self, task_id: str):
        """Mark task as deferred (no PP loss)"""
        task = None
        for i, t in enumerate(self.data['active_tasks']):
            if t['id'] == task_id:
                task = self.data['active_tasks'].pop(i)
                break
        
        if not task:
            return
        
        history_entry = {
            'title': task['title'],
            'category': task['category'],
            'severity': task.get('severity', 'med'),
            'deadline': task['deadline'],
            'completion_time': datetime.now().isoformat(),
            'pp_earned': 0,
            'base_pp': task['base_pp'],
            'status': 'deferred'
        }
        self.data['history'].append(history_entry)
        
        save_data(self.data_file, self.data)
        self.refresh_ui()
        self.show_snackbar("Task deferred successfully.")

    def reschedule_task(self, task_id: str, new_deadline: datetime):
        """Reschedule an active task to a new deadline; mark rescheduled flag"""
        for t in self.data['active_tasks']:
            if t['id'] == task_id:
                t['deadline'] = new_deadline.isoformat()
                t['rescheduled'] = True
                t['rescheduled_at'] = datetime.now().isoformat()
                save_data(self.data_file, self.data)
                self.refresh_ui()
                self.show_snackbar("Task rescheduled (PP for completion will be halved).")
                return

    def open_reschedule_dialog(self, task: Dict):
        """Open an enhanced date/time picker dialog for rescheduling a task"""
        selected = {'date': None, 'time': None}

        def date_change(e):
            selected['date'] = dp.value
            if selected['date']:
                date_text.value = f"📅 {selected['date'].strftime('%B %d, %Y')}"
                date_text.color = ft.Colors.GREEN_400
            dialog.update()

        def time_change(e):
            selected['time'] = tp.value
            if selected['time']:
                time_text.value = f"⏰ {selected['time'].strftime('%I:%M %p')}"
                time_text.color = ft.Colors.GREEN_400
            dialog.update()

        def do_reschedule(e):
            if not selected['date'] or not selected['time']:
                self.show_snackbar("Please select both date and time to reschedule.")
                return
            new_dt = datetime.combine(selected['date'], selected['time'])
            if new_dt <= datetime.now():
                self.show_snackbar("New deadline must be in the future.")
                return
            self.reschedule_task(task['id'], new_dt)
            dialog.open = False
            self.page.update()

        def close_dialog(e):
            dialog.open = False
            self.page.update()

        date_text = ft.Text("Select a date", color=ft.Colors.GREY_400, size=14)
        time_text = ft.Text("Select a time", color=ft.Colors.GREY_400, size=14)

        dp = ft.DatePicker(
            on_change=date_change, 
            first_date=datetime.now().date(), 
            last_date=datetime.now().date() + timedelta(days=365)
        )
        tp = ft.TimePicker(on_change=time_change)

        current_deadline = datetime.fromisoformat(task['deadline'])

        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Container(
                content=ft.Row([
                    ft.Row([
                        ft.Icon(ft.Icons.SCHEDULE, color=ft.Colors.AMBER, size=28),
                        ft.Text("Reschedule Task", 
                               color=ft.Colors.WHITE,
                               style=ft.TextThemeStyle.TITLE_LARGE,
                               weight=ft.FontWeight.BOLD)
                    ], spacing=8),
                    ft.IconButton(
                        icon=ft.Icons.CLOSE,
                        on_click=close_dialog,
                        icon_color=ft.Colors.GREY_400,
                        icon_size=20
                    )
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                padding=ft.padding.symmetric(horizontal=8, vertical=4)
            ),
            content=ft.Container(
                content=ft.Column([
                    ft.Container(
                        content=ft.Column([
                            ft.Text("Task:", 
                                   color=ft.Colors.AMBER, 
                                   weight=ft.FontWeight.BOLD),
                            ft.Text(task['title'], 
                                   color=ft.Colors.WHITE,
                                   style=ft.TextThemeStyle.BODY_LARGE)
                        ], spacing=4),
                        bgcolor=ft.Colors.GREY_800,
                        padding=12,
                        border_radius=8
                    ),
                    ft.Container(
                        content=ft.Column([
                            ft.Text("Current Deadline:", 
                                   color=ft.Colors.RED_400, 
                                   weight=ft.FontWeight.BOLD),
                            ft.Text(current_deadline.strftime('%B %d, %Y at %I:%M %p'), 
                                   color=ft.Colors.GREY_300)
                        ], spacing=4),
                        bgcolor=ft.Colors.GREY_800,
                        padding=12,
                        border_radius=8
                    ),
                    ft.Divider(color=ft.Colors.GREY_600, height=1),
                    ft.Text("Select New Deadline:", 
                           color=ft.Colors.DEEP_PURPLE_200, 
                           weight=ft.FontWeight.BOLD,
                           style=ft.TextThemeStyle.TITLE_MEDIUM),
                    ft.Container(
                        content=ft.Column([
                            ft.Row([
                                ft.ElevatedButton(
                                    "Pick Date",
                                    icon=ft.Icons.CALENDAR_TODAY,
                                    on_click=lambda _: (
                                        self.page.overlay.append(dp),
                                        setattr(dp, 'open', True),
                                        self.page.update()
                                    ),
                                    style=ft.ButtonStyle(
                                        bgcolor=ft.Colors.BLUE,
                                        color=ft.Colors.WHITE,
                                        shape=ft.RoundedRectangleBorder(radius=8)
                                    )
                                ),
                                date_text
                            ], alignment=ft.MainAxisAlignment.START, spacing=12),
                            ft.Row([
                                ft.ElevatedButton(
                                    "Pick Time",
                                    icon=ft.Icons.ACCESS_TIME,
                                    on_click=lambda _: (
                                        self.page.overlay.append(tp),
                                        setattr(tp, 'open', True),
                                        self.page.update()
                                    ),
                                    style=ft.ButtonStyle(
                                        bgcolor=ft.Colors.ORANGE,
                                        color=ft.Colors.WHITE,
                                        shape=ft.RoundedRectangleBorder(radius=8)
                                    )
                                ),
                                time_text
                            ], alignment=ft.MainAxisAlignment.START, spacing=12)
                        ], spacing=12),
                        bgcolor=ft.Colors.GREY_800,
                        padding=16,
                        border_radius=8
                    ),
                    ft.Container(
                        content=ft.Row([
                            ft.Icon(ft.Icons.WARNING, color=ft.Colors.ORANGE, size=16),
                            ft.Text("Note: Rescheduled tasks earn half PP when completed",
                                   color=ft.Colors.ORANGE,
                                   style=ft.TextThemeStyle.BODY_SMALL,
                                   italic=True)
                        ], spacing=8),
                        bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.ORANGE_100),
                        padding=12,
                        border_radius=8,
                        border=ft.border.all(1, ft.Colors.with_opacity(0.3, ft.Colors.ORANGE))
                    )
                ], spacing=16),
                width=450,
                height=400,
                padding=16
            ),
            actions=[
                ft.Row([
                    ft.TextButton(
                        "Cancel", 
                        on_click=close_dialog,
                        style=ft.ButtonStyle(color=ft.Colors.GREY_400)
                    ),
                    ft.ElevatedButton(
                        "Reschedule Task",
                        icon=ft.Icons.SCHEDULE,
                        on_click=do_reschedule,
                        style=ft.ButtonStyle(
                            bgcolor=ft.Colors.DEEP_PURPLE,
                            color=ft.Colors.WHITE,
                            shape=ft.RoundedRectangleBorder(radius=8)
                        )
                    )
                ], alignment=ft.MainAxisAlignment.END, spacing=8)
            ],
            bgcolor=ft.Colors.GREY_900,
            shape=ft.RoundedRectangleBorder(radius=16),
        )
        self.page.overlay.append(dialog)
        dialog.open = True
        self.page.update()

    def auto_process_overdue(self):
        """Automatically mark tasks as missed if they're overdue by 72 hours"""
        now = datetime.now()
        to_mark = []
        for t in list(self.data['active_tasks']):
            deadline = datetime.fromisoformat(t['deadline'])
            # If task is not already processed and past deadline + 72 hours
            if now > deadline + timedelta(hours=72):
                to_mark.append(t['id'])

        for tid in to_mark:
            self.miss_task(tid)
    
    def open_date_picker(self, e):
        """Open date picker dialog"""
        def date_change(e):
            self.selected_date = self.deadline_date_picker.value
            if self.date_button:
                self.date_button.text = f"📅 {self.selected_date.strftime('%b %d, %Y')}"
            self.deadline_date_picker.open = False
            self.page.update()
        
        self.deadline_date_picker = ft.DatePicker(
            on_change=date_change,
            first_date=datetime.now().date(),
            last_date=datetime.now().date() + timedelta(days=365),
        )
        
        self.page.overlay.append(self.deadline_date_picker)
        self.deadline_date_picker.open = True
        self.page.update()
    
    def open_time_picker(self, e):
        """Open time picker dialog"""
        def time_change(e):
            self.selected_time = self.deadline_time_picker.value
            if self.time_button:
                self.time_button.text = f"🕐 {self.selected_time.strftime('%I:%M %p')}"
            self.deadline_time_picker.open = False
            self.page.update()
        
        self.deadline_time_picker = ft.TimePicker(
            on_change=time_change,
        )
        
        self.page.overlay.append(self.deadline_time_picker)
        self.deadline_time_picker.open = True
        self.page.update()
    
    def add_task(self, e):
        """Add a new task"""
        if not all([
            self.task_title_field.value,
            self.task_category_dropdown.value,
            self.task_pp_field.value,
            self.task_severity_dropdown.value,
            self.selected_date,
            self.selected_time
        ]):
            self.show_snackbar("Please fill in all fields and select date/time")
            return
        
        try:
            base_pp = int(self.task_pp_field.value)
            if base_pp <= 0:
                raise ValueError
        except ValueError:
            self.show_snackbar("PP must be a positive integer")
            return
        
        # Combine date and time
        deadline_datetime = datetime.combine(self.selected_date, self.selected_time)
        
        task = {
            'id': str(int(uuid4().hex, 16) + int(datetime.now().timestamp())),
            'title': self.task_title_field.value,
            'category': self.task_category_dropdown.value,
            'base_pp': base_pp,
            'severity': self.task_severity_dropdown.value,
            'deadline': deadline_datetime.isoformat()
        }
        
        self.data['active_tasks'].append(task)
        save_data(self.data_file, self.data)
        
        # Clear form
        self.task_title_field.value = ""
        self.task_category_dropdown.value = None
        self.task_pp_field.value = ""
        self.task_severity_dropdown.value = None
        self.selected_date = None
        self.selected_time = None
        self.date_button.text = "Select Date 📅"
        self.time_button.text = "Select Time 🕐"
        
        self.refresh_ui()
        self.show_snackbar("Task added successfully! ✨")
    
    def open_category_dialog(self, e):
        """Open enhanced category management dialog"""
        new_category_field = ft.TextField(
            label="New Category", 
            hint_text="Enter category name",
            width=350, 
            text_size=14,
            border_radius=8,
            bgcolor=ft.Colors.GREY_800,
            color=ft.Colors.WHITE
        )
        
        category_list_view = ft.ListView(expand=True, spacing=8)
        
        def update_list():
            """Update the category list view"""
            category_list_view.controls.clear()
            for i, cat in enumerate(self.data['categories']):
                delete_btn = None
                if len(self.data['categories']) > 1:
                    delete_btn = ft.IconButton(
                        icon=ft.Icons.DELETE_OUTLINE, 
                        tooltip="Delete category",
                        icon_color=ft.Colors.RED_400, 
                        icon_size=20,
                        data=cat, 
                        on_click=lambda e, cat_name=cat: delete_category(cat_name)
                    )
                
                category_list_view.controls.append(
                    ft.Container(
                        content=ft.Row([
                            ft.Container(
                                content=ft.Row([
                                    ft.Icon(ft.Icons.LABEL, color=ft.Colors.DEEP_PURPLE, size=20),
                                    ft.Text(cat, color=ft.Colors.WHITE, size=15, weight=ft.FontWeight.W_500)
                                ], spacing=12),
                                expand=True
                            ),
                            delete_btn
                        ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                        bgcolor=ft.Colors.GREY_700 if i % 2 == 0 else ft.Colors.GREY_600,
                        padding=ft.padding.symmetric(horizontal=16, vertical=12),
                        border_radius=8,
                        border=ft.border.all(1, ft.Colors.GREY_600),
                        margin=ft.margin.only(bottom=4)
                    )
                )
            self.page.update()

        def add_category():
            """Add a new category"""
            category_name = new_category_field.value.strip()
            if not category_name:
                self.show_snackbar("Please enter a category name")
                return
            if category_name in self.data['categories']:
                self.show_snackbar("Category already exists!")
                return
            self.data['categories'].append(category_name)
            save_data(self.data_file, self.data)
            new_category_field.value = ""
            update_list()
            self.show_snackbar(f"Category '{category_name}' added successfully!")

        def delete_category(category_name):
            """Delete a category"""
            if len(self.data['categories']) <= 1:
                self.show_snackbar("Cannot delete the last category!")
                return
            if category_name in self.data['categories']:
                self.data['categories'].remove(category_name)
                save_data(self.data_file, self.data)
                update_list()
                self.show_snackbar(f"Category '{category_name}' deleted!")

        def close_dialog(e=None):
            """Close the dialog"""
            dialog.open = False
            self.refresh_ui()
            self.page.update()

        # Enhanced dialog with better styling
        dialog = ft.AlertDialog(
            modal=True,
            title=ft.Container(
                content=ft.Row([
                    ft.Row([
                        ft.Icon(ft.Icons.SETTINGS, color=ft.Colors.DEEP_PURPLE, size=28),
                        ft.Text("Manage Categories", 
                               style=ft.TextThemeStyle.TITLE_LARGE,
                               color=ft.Colors.WHITE, 
                               weight=ft.FontWeight.BOLD)
                    ], spacing=8),
                    ft.IconButton(
                        icon=ft.Icons.CLOSE, 
                        on_click=close_dialog, 
                        icon_color=ft.Colors.GREY_300,
                        icon_size=24,
                        tooltip="Close"
                    )
                ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                padding=ft.padding.symmetric(horizontal=8, vertical=4)
            ),
            content=ft.Container(
                width=550, 
                height=450, 
                content=ft.Column([
                    ft.Container(
                        content=ft.Text("Current Categories", 
                                       style=ft.TextThemeStyle.TITLE_MEDIUM,
                                       color=ft.Colors.AMBER_300, 
                                       weight=ft.FontWeight.BOLD),
                        margin=ft.margin.only(bottom=8)
                    ),
                    ft.Container(
                        content=category_list_view,
                        bgcolor=ft.Colors.GREY_800,
                        border=ft.border.all(2, ft.Colors.GREY_600),
                        border_radius=12, 
                        padding=12, 
                        expand=True,
                        height=220
                    ),
                    ft.Container(
                        content=ft.Divider(color=ft.Colors.GREY_600, thickness=2),
                        margin=ft.margin.symmetric(vertical=12)
                    ),
                    ft.Container(
                        content=ft.Text("Add New Category", 
                                       style=ft.TextThemeStyle.TITLE_MEDIUM,
                                       color=ft.Colors.AMBER_300, 
                                       weight=ft.FontWeight.BOLD),
                        margin=ft.margin.only(bottom=8)
                    ),
                    ft.Container(
                        content=ft.Row([
                            ft.Container(content=new_category_field, expand=True),
                            ft.ElevatedButton(
                                "Add Category", 
                                icon=ft.Icons.ADD_CIRCLE_OUTLINE, 
                                on_click=lambda _: add_category(),
                                style=ft.ButtonStyle(
                                    bgcolor=ft.Colors.DEEP_PURPLE, 
                                    color=ft.Colors.WHITE,
                                    shape=ft.RoundedRectangleBorder(radius=8),
                                    padding=ft.padding.symmetric(horizontal=20, vertical=12)
                                )
                            )
                        ], spacing=12),
                        bgcolor=ft.Colors.GREY_800,
                        padding=16,
                        border_radius=12,
                        border=ft.border.all(1, ft.Colors.GREY_600)
                    )
                ], spacing=0),
                padding=20
            ),
            actions=[],
            bgcolor=ft.Colors.GREY_900,
            shape=ft.RoundedRectangleBorder(radius=16),
        )

        # Initial population and opening sequence
        update_list()
        self.page.overlay.append(dialog)
        dialog.open = True
        self.page.update()
    
    def show_snackbar(self, message: str):
        """Show a snackbar message"""
        snackbar = ft.SnackBar(
            content=ft.Text(message, color=ft.Colors.WHITE),
            action="OK",
            bgcolor=ft.Colors.GREY_800,
            action_color=ft.Colors.DEEP_PURPLE,
            duration=3000,
        )
        self.page.overlay.append(snackbar)
        snackbar.open = True
        self.page.update()
    
    def create_task_card(self, task: Dict) -> ft.Card:
        """Create a card for an active task with visual alerts for overdue tasks"""
        deadline = datetime.fromisoformat(task['deadline'])
        now = datetime.now()
        severity = task.get('severity', 'med')
        severity_colors = {
            'low': ft.Colors.GREEN,
            'med': ft.Colors.ORANGE,
            'high': ft.Colors.RED
        }
        severity_color = severity_colors.get(severity, ft.Colors.ORANGE)
        
        # Enhanced visual alerts for overdue tasks
        is_overdue = now > deadline
        is_soon_overdue = now > deadline + timedelta(hours=48)  # Extra warning after 48h
        
        if is_overdue:
            if is_soon_overdue:
                deadline_color = ft.Colors.RED_900
                deadline_bg = ft.Colors.RED_200
                deadline_text = f"⚠️ CRITICAL OVERDUE"
                status_icon = ft.Icons.ERROR
                card_border = ft.border.all(3, ft.Colors.RED)
            else:
                deadline_color = ft.Colors.RED
                deadline_bg = ft.Colors.RED_100
                deadline_text = f"⏰ OVERDUE"
                status_icon = ft.Icons.WARNING
                card_border = ft.border.all(2, ft.Colors.RED_400)
        elif now > deadline - timedelta(hours=24):
            deadline_color = ft.Colors.ORANGE
            deadline_bg = ft.Colors.ORANGE_100
            deadline_text = f"⏰ Due Soon"
            status_icon = ft.Icons.SCHEDULE
            card_border = None
        else:
            deadline_color = ft.Colors.GREEN
            deadline_bg = ft.Colors.GREEN_100
            deadline_text = f"⏰ Upcoming"
            status_icon = ft.Icons.SCHEDULE
            card_border = None
        
        return ft.Card(
            content=ft.Container(
                content=ft.Column([
                    ft.Row([
                        ft.Icon(status_icon, color=deadline_color),
                        ft.Text(task['title'], 
                               style=ft.TextThemeStyle.TITLE_MEDIUM, 
                               expand=True,
                               weight=ft.FontWeight.W_600),
                        ft.Container(
                            content=ft.Text(f"{task['base_pp']} PP", 
                                           style=ft.TextThemeStyle.LABEL_LARGE,
                                           color=ft.Colors.WHITE),
                            bgcolor=ft.Colors.DEEP_PURPLE,
                            padding=ft.padding.symmetric(horizontal=12, vertical=6),
                            border_radius=20
                        )
                    ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                    
                    ft.Row([
                        ft.Container(
                            content=ft.Text(deadline_text, 
                                           style=ft.TextThemeStyle.BODY_MEDIUM,
                                           color=deadline_color,
                                           weight=ft.FontWeight.W_500),
                            bgcolor=deadline_bg,
                            padding=ft.padding.symmetric(horizontal=10, vertical=4),
                            border_radius=16
                        ),
                        ft.Container(
                            content=ft.Text(f"Severity: {severity.upper()}", 
                                           style=ft.TextThemeStyle.BODY_SMALL,
                                           color=severity_color,
                                           weight=ft.FontWeight.W_600),
                            bgcolor=ft.Colors.GREY_700,
                            padding=ft.padding.symmetric(horizontal=8, vertical=4),
                            border_radius=12
                        )
                    ], spacing=10),
                    
                    ft.Text(f"📅 {deadline.strftime('%d-%m-%Y at %I:%M %p')}", 
                           style=ft.TextThemeStyle.BODY_SMALL,
                           color=ft.Colors.GREY_600),
                    
                    # Show rescheduled indicator if applicable
                    ft.Container(
                        content=ft.Row([
                            ft.Icon(ft.Icons.SCHEDULE_SEND, color=ft.Colors.ORANGE, size=16),
                            ft.Text("Rescheduled (Half PP)", 
                                   color=ft.Colors.ORANGE, 
                                   style=ft.TextThemeStyle.BODY_SMALL,
                                   italic=True)
                        ], spacing=4),
                        visible=task.get('rescheduled', False)
                    ),
                    
                    ft.Row([
                        ft.ElevatedButton(
                            "Complete",
                            icon=ft.Icons.CHECK_CIRCLE,
                            style=ft.ButtonStyle(
                                color=ft.Colors.WHITE,
                                bgcolor=ft.Colors.GREEN,
                            ),
                            on_click=lambda e, tid=task['id']: self.complete_task(tid)
                        ),
                        ft.ElevatedButton(
                            "Reschedule",
                            icon=ft.Icons.SCHEDULE,
                            style=ft.ButtonStyle(
                                color=ft.Colors.WHITE,
                                bgcolor=ft.Colors.ORANGE,
                            ),
                            on_click=lambda e, t=task: self.open_reschedule_dialog(t)
                        ),
                        ft.ElevatedButton(
                            "Defer",
                            icon=ft.Icons.SCHEDULE_SEND,
                            style=ft.ButtonStyle(
                                color=ft.Colors.WHITE,
                                bgcolor=ft.Colors.BLUE,
                            ),
                            on_click=lambda e, tid=task['id']: self.defer_task(tid)
                        ),
                        ft.ElevatedButton(
                            "Missed",
                            icon=ft.Icons.CANCEL,
                            style=ft.ButtonStyle(
                                color=ft.Colors.WHITE,
                                bgcolor=ft.Colors.RED,
                            ),
                            on_click=lambda e, tid=task['id']: self.miss_task(tid)
                        )
                    ], alignment=ft.MainAxisAlignment.SPACE_EVENLY, wrap=True, spacing=8)
                ]),
                padding=20,
                bgcolor=ft.Colors.GREY_900,
                border_radius=12,
                border=card_border
            ),
            elevation=3 if not is_overdue else 8
        )
    
    def create_history_card(self, entry: Dict) -> ft.Card:
        """Create a card for a history entry"""
        status_colors = {
            'completed': ft.Colors.GREEN,
            'missed': ft.Colors.RED,
            'deferred': ft.Colors.BLUE
        }
        status_backgrounds = {
            'completed': ft.Colors.GREEN_100,
            'missed': ft.Colors.RED_100,
            'deferred': ft.Colors.BLUE_100
        }
        status_icons = {
            'completed': ft.Icons.CHECK_CIRCLE,
            'missed': ft.Icons.CANCEL,
            'deferred': ft.Icons.SCHEDULE_SEND
        }
        
        status = entry['status']
        status_color = status_colors.get(status, ft.Colors.GREY)
        status_bg = status_backgrounds.get(status, ft.Colors.GREY_100)
        status_icon = status_icons.get(status, ft.Icons.HELP)
        
        pp_text = f"+{entry['pp_earned']}" if entry['pp_earned'] > 0 else str(entry['pp_earned']) if entry['pp_earned'] < 0 else "0"
        
        completion_time = datetime.fromisoformat(entry['completion_time'])
        
        return ft.Card(
            content=ft.Container(
                content=ft.Column([
                    ft.Row([
                        ft.Icon(status_icon, color=status_color, size=20),
                        ft.Text(entry['title'], 
                               style=ft.TextThemeStyle.TITLE_SMALL, 
                               expand=True,
                               weight=ft.FontWeight.W_500),
                        ft.Container(
                            content=ft.Text(f"{pp_text} PP", 
                                           style=ft.TextThemeStyle.LABEL_MEDIUM,
                                           color=status_color,
                                           weight=ft.FontWeight.BOLD),
                            bgcolor=status_bg,
                            padding=ft.padding.symmetric(horizontal=10, vertical=4),
                            border_radius=16
                        )
                    ]),
                    ft.Text(f"📂 {entry['category']} | Severity: {entry.get('severity', 'med').upper()}", 
                           style=ft.TextThemeStyle.BODY_SMALL,
                           color=ft.Colors.GREY_600),
                    ft.Text(f"📅 Deadline: {datetime.fromisoformat(entry['deadline']).strftime('%d-%m-%Y at %I:%M %p')}", 
                           style=ft.TextThemeStyle.BODY_SMALL,
                           color=ft.Colors.GREY_600),
                    ft.Text(f"✅ Action: {completion_time.strftime('%d-%m-%Y at %I:%M %p')}", 
                           style=ft.TextThemeStyle.BODY_SMALL,
                           color=ft.Colors.GREY_600)
                ]),
                padding=16,
                bgcolor=ft.Colors.GREY_900,
                border_radius=8
            ),
            elevation=1
        )
    
    def create_stats_page(self):
        """Create the enhanced statistics page with month navigation"""
        stats = self.analytics.get_monthly_stats(self.current_stats_year, self.current_stats_month)
        potential_pp = self.analytics.calculate_potential_pp()
        
        def navigate_month(direction):
            if direction == "prev":
                if self.current_stats_month == 1:
                    self.current_stats_month = 12
                    self.current_stats_year -= 1
                else:
                    self.current_stats_month -= 1
            else:  # next
                if self.current_stats_month == 12:
                    self.current_stats_month = 1
                    self.current_stats_year += 1
                else:
                    self.current_stats_month += 1
            self.refresh_stats_page()
        
        # Category performance chart - excluding deferred
        category_rows = []
        for category, data in stats['category_stats'].items():
            completion_rate = (data['completed'] / data['total'] * 100) if data['total'] > 0 else 0
            category_rows.append(
                ft.DataRow(cells=[
                    ft.DataCell(ft.Text(category, color=ft.Colors.WHITE)),
                    ft.DataCell(ft.Text(str(data['completed']), color=ft.Colors.GREEN)),
                    ft.DataCell(ft.Text(str(data['missed']), color=ft.Colors.RED)),
                    ft.DataCell(ft.Text(f"{completion_rate:.1f}%", color=ft.Colors.WHITE))
                ])
            )
        
        # Enhanced calendar visualization with better styling
        cal = calendar.monthcalendar(self.current_stats_year, self.current_stats_month)
        calendar_grid = []
        
        # Header with days of week
        weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        header_row = ft.Row([
            ft.Container(
                ft.Text(day, style=ft.TextThemeStyle.LABEL_MEDIUM, color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD),
                width=45, height=35, alignment=ft.alignment.center,
                bgcolor=ft.Colors.DEEP_PURPLE_400,
                border_radius=8
            ) for day in weekdays
        ], alignment=ft.MainAxisAlignment.SPACE_EVENLY)
        calendar_grid.append(header_row)
        
        # Calendar days with enhanced styling
        colors = {
            'productive': ft.Colors.GREEN_600,
            'average': ft.Colors.ORANGE_600,
            'lazy': ft.Colors.RED_600,
            'no_data': ft.Colors.GREY_600
        }
        
        for week in cal:
            week_row = []
            for day in week:
                if day == 0:
                    week_row.append(ft.Container(width=45, height=45))
                else:
                    day_status = stats['calendar_data'].get(day, 'no_data')
                    is_today = (day == datetime.now().day and 
                              self.current_stats_month == datetime.now().month and 
                              self.current_stats_year == datetime.now().year)
                    
                    week_row.append(
                        ft.Container(
                            ft.Text(str(day), color=ft.Colors.WHITE, size=13, weight=ft.FontWeight.BOLD),
                            width=45, height=45,
                            bgcolor=colors.get(day_status, ft.Colors.GREY_600),
                            border_radius=22,
                            alignment=ft.alignment.center,
                            margin=2,
                            border=ft.border.all(3, ft.Colors.WHITE) if is_today else None,
                            shadow=ft.BoxShadow(
                                spread_radius=1,
                                blur_radius=4,
                                color=ft.Colors.BLACK26,
                                offset=ft.Offset(0, 2)
                            ) if day_status != 'no_data' else None
                        )
                    )
            calendar_grid.append(
                ft.Row(week_row, alignment=ft.MainAxisAlignment.SPACE_EVENLY)
            )
        
        return ft.Column([
            # Enhanced header with navigation
            ft.Container(
                content=ft.Column([
                    ft.Text(f"📊 Statistics Dashboard", 
                           style=ft.TextThemeStyle.HEADLINE_MEDIUM,
                           color=ft.Colors.WHITE,
                           weight=ft.FontWeight.BOLD),
                    ft.Row([
                        ft.IconButton(
                            icon=ft.Icons.CHEVRON_LEFT,
                            icon_color=ft.Colors.WHITE,
                            bgcolor=ft.Colors.DEEP_PURPLE,
                            on_click=lambda _: navigate_month("prev"),
                            tooltip="Previous Month"
                        ),
                        ft.Text(f"{calendar.month_name[self.current_stats_month]} {self.current_stats_year}", 
                               style=ft.TextThemeStyle.HEADLINE_SMALL,
                               color=ft.Colors.DEEP_PURPLE_200,
                               weight=ft.FontWeight.BOLD),
                        ft.IconButton(
                            icon=ft.Icons.CHEVRON_RIGHT,
                            icon_color=ft.Colors.WHITE,
                            bgcolor=ft.Colors.DEEP_PURPLE,
                            on_click=lambda _: navigate_month("next"),
                            tooltip="Next Month"
                        )
                    ], alignment=ft.MainAxisAlignment.CENTER, spacing=20)
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                bgcolor=ft.Colors.GREY_800,
                padding=20,
                border_radius=12,
                margin=ft.margin.only(bottom=20)
            ),
            
            # Monthly overview cards
            ft.Row([
                ft.Container(
                    content=ft.Column([
                        ft.Icon(ft.Icons.TRENDING_UP, size=32, color=ft.Colors.GREEN),
                        ft.Text("Potential PP", 
                               style=ft.TextThemeStyle.LABEL_LARGE,
                               color=ft.Colors.WHITE),
                        ft.Text(str(potential_pp), 
                               style=ft.TextThemeStyle.DISPLAY_SMALL,
                               weight=ft.FontWeight.BOLD,
                               color=ft.Colors.GREEN)
                    ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    bgcolor=ft.Colors.GREY_800,
                    padding=20,
                    border_radius=12,
                    expand=1
                ),
                ft.Container(
                    content=ft.Column([
                        ft.Icon(ft.Icons.ASSESSMENT, size=32, color=ft.Colors.BLUE),
                        ft.Text("Categories", style=ft.TextThemeStyle.LABEL_LARGE, color=ft.Colors.WHITE),
                        ft.Text(str(len(stats['category_stats'])), 
                               style=ft.TextThemeStyle.DISPLAY_SMALL,
                               weight=ft.FontWeight.BOLD, color=ft.Colors.BLUE)
                    ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    bgcolor=ft.Colors.GREY_800,
                    padding=20, border_radius=12, expand=1
                )
            ], spacing=10),
            
            # Category performance table - without deferred column
            ft.Container(
                content=ft.Column([
                    ft.Text("📈 Category Performance", 
                           style=ft.TextThemeStyle.TITLE_MEDIUM,
                           color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD),
                    ft.DataTable(
                        columns=[
                            ft.DataColumn(ft.Text("Category", color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD)),
                            ft.DataColumn(ft.Text("Completed", color=ft.Colors.GREEN, weight=ft.FontWeight.BOLD)),
                            ft.DataColumn(ft.Text("Missed", color=ft.Colors.RED, weight=ft.FontWeight.BOLD)),
                            ft.DataColumn(ft.Text("Success Rate", color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD))
                        ],
                        rows=category_rows,
                        bgcolor=ft.Colors.GREY_800,
                        border_radius=8,
                        heading_row_color=ft.Colors.GREY_700
                    ) if category_rows else ft.Text("No data available for this month", 
                                                   color=ft.Colors.GREY_400, 
                                                   style=ft.TextThemeStyle.BODY_LARGE)
                ]),
                bgcolor=ft.Colors.GREY_800,
                padding=20,
                border_radius=12,
                margin=ft.margin.symmetric(vertical=10)
            ),
            
            # Enhanced calendar heatmap
            ft.Container(
                content=ft.Column([
                    ft.Text("🗓️ Daily Activity Calendar", 
                           style=ft.TextThemeStyle.TITLE_MEDIUM,
                           color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD),
                    ft.Container(
                        content=ft.Column(calendar_grid, spacing=8),
                        bgcolor=ft.Colors.GREY_700,
                        padding=16,
                        border_radius=12
                    ),
                    ft.Container(
                        content=ft.Row([
                            ft.Row([
                                ft.Container(width=18, height=18, bgcolor=ft.Colors.GREEN_600, border_radius=9),
                                ft.Text("Productive (70%+)", color=ft.Colors.WHITE, size=12, weight=ft.FontWeight.W_500)
                            ], spacing=6),
                            ft.Row([
                                ft.Container(width=18, height=18, bgcolor=ft.Colors.ORANGE_600, border_radius=9),
                                ft.Text("Average (30-70%)", color=ft.Colors.WHITE, size=12, weight=ft.FontWeight.W_500)
                            ], spacing=6),
                            ft.Row([
                                ft.Container(width=18, height=18, bgcolor=ft.Colors.RED_600, border_radius=9),
                                ft.Text("Lazy (<30%)", color=ft.Colors.WHITE, size=12, weight=ft.FontWeight.W_500)
                            ], spacing=6),
                            ft.Row([
                                ft.Container(width=18, height=18, bgcolor=ft.Colors.GREY_600, border_radius=9),
                                ft.Text("No Data", color=ft.Colors.WHITE, size=12, weight=ft.FontWeight.W_500)
                            ], spacing=6)
                        ], alignment=ft.MainAxisAlignment.SPACE_AROUND, wrap=True, spacing=12),
                        padding=12,
                        margin=ft.margin.only(top=8)
                    )
                ]),
                bgcolor=ft.Colors.GREY_800,
                padding=20,
                border_radius=12,
                margin=ft.margin.symmetric(vertical=10)
            )
        ], scroll=ft.ScrollMode.AUTO)
    
    def refresh_stats_page(self):
        """Refresh just the stats page content"""
        if self.stats_page_container:
            self.stats_page_container.content = self.create_stats_page()
            self.page.update()
    
    def refresh_ui(self):
        """Refresh the UI with current data"""
        if not self.page:
            return
        # Auto-process overdue tasks (72h rule)
        self.auto_process_overdue()
        
        # Update stats with gradient cards
        total_pp = self.data['total_pp']
        title = self.analytics.get_title(total_pp)
        streak = self.data['streak']
        
        self.stats_container.content = ft.Column([
            ft.Container(
                content=ft.Column([
                    ft.Text("🎯 Productivity Dashboard", 
                           style=ft.TextThemeStyle.HEADLINE_MEDIUM, 
                           text_align=ft.TextAlign.CENTER,
                           color=ft.Colors.WHITE,
                           weight=ft.FontWeight.BOLD),
                    ft.Divider(color=ft.Colors.WHITE70, thickness=2),
                    ft.Row([
                        ft.Container(
                            content=ft.Column([
                                ft.Icon(ft.Icons.STARS, size=32, color=ft.Colors.AMBER),
                                ft.Text("Current PP", 
                                       style=ft.TextThemeStyle.LABEL_LARGE,
                                       color=ft.Colors.WHITE),
                                ft.Text(str(total_pp), 
                                       style=ft.TextThemeStyle.DISPLAY_SMALL,
                                       weight=ft.FontWeight.BOLD,
                                       color=ft.Colors.AMBER)
                            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=5),
                            bgcolor=ft.Colors.GREY_800,
                            padding=20,
                            border_radius=12,
                            expand=True
                        ),
                        ft.Container(
                            content=ft.Column([
                                ft.Icon(ft.Icons.MILITARY_TECH, size=32, color=ft.Colors.DEEP_PURPLE),
                                ft.Text("Current Title", 
                                       style=ft.TextThemeStyle.LABEL_LARGE,
                                       color=ft.Colors.WHITE),
                                ft.Text(
                                    title, 
                                    style=ft.TextThemeStyle.TITLE_MEDIUM,
                                    text_align=ft.TextAlign.CENTER,
                                    weight=ft.FontWeight.BOLD,
                                    color=ft.Colors.DEEP_PURPLE_200,
                                    no_wrap=False  # Allow text to wrap
                                )
                            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=5),
                            bgcolor=ft.Colors.GREY_800,
                            padding=20,
                            border_radius=12,
                            expand=True
                        ),
                        ft.Container(
                            content=ft.Column([
                                ft.Icon(ft.Icons.LOCAL_FIRE_DEPARTMENT, size=32, color=ft.Colors.ORANGE),
                                ft.Text("Streak", 
                                       style=ft.TextThemeStyle.LABEL_LARGE,
                                       color=ft.Colors.WHITE),
                                ft.Text(f"{streak} days", 
                                       style=ft.TextThemeStyle.DISPLAY_SMALL,
                                       weight=ft.FontWeight.BOLD,
                                       color=ft.Colors.ORANGE)
                            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=5),
                            bgcolor=ft.Colors.GREY_800,
                            padding=20,
                            border_radius=12,
                            expand=True
                        )
                    ], alignment=ft.MainAxisAlignment.SPACE_AROUND, spacing=10)
                ]),
                padding=24,
                bgcolor=ft.Colors.DEEP_PURPLE,
                border_radius=16,
                margin=ft.margin.only(bottom=20)
            )
        ])
        
        # Update active tasks grouped by category
        self.active_tasks_column.controls.clear()
        grouped_tasks = self.analytics.group_tasks_by_category()
        
        if grouped_tasks:
            for category, tasks in grouped_tasks.items():
                # Category header
                self.active_tasks_column.controls.append(
                    ft.Container(
                        content=ft.Row([
                            ft.Icon(ft.Icons.LABEL, color=ft.Colors.DEEP_PURPLE),
                            ft.Text(f"{category} ({len(tasks)} tasks)", 
                                   style=ft.TextThemeStyle.TITLE_MEDIUM,
                                   weight=ft.FontWeight.BOLD,
                                   color=ft.Colors.WHITE)
                        ]),
                        bgcolor=ft.Colors.GREY_800,
                        padding=ft.padding.symmetric(horizontal=16, vertical=8),
                        border_radius=8,
                        margin=ft.margin.symmetric(vertical=8)
                    )
                )
                
                # Tasks in category
                for task in sorted(tasks, key=lambda x: x['deadline']):
                    self.active_tasks_column.controls.append(self.create_task_card(task))
        else:
            self.active_tasks_column.controls.append(
                ft.Container(
                    content=ft.Column([
                        ft.Icon(ft.Icons.INBOX, size=64, color=ft.Colors.GREY),
                        ft.Text("No active tasks", 
                               style=ft.TextThemeStyle.HEADLINE_SMALL,
                               text_align=ft.TextAlign.CENTER,
                               color=ft.Colors.GREY),
                        ft.Text("Add your first task to get started!", 
                               style=ft.TextThemeStyle.BODY_LARGE,
                               text_align=ft.TextAlign.CENTER,
                               color=ft.Colors.GREY)
                    ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    alignment=ft.alignment.center,
                    padding=40,
                    margin=20
                )
            )
        
        # Update history grouped by date
        self.history_column.controls.clear()
        if self.data['history']:
            grouped_history = self.analytics.group_history_by_date()
            sorted_dates = sorted(grouped_history.keys(), reverse=True)
            
            for date_key in sorted_dates:
                entries = grouped_history[date_key]
                
                # Format date header
                today = datetime.now().date()
                if date_key == today:
                    date_text = "Today"
                elif date_key == today - timedelta(days=1):
                    date_text = "Yesterday"
                else:
                    date_text = date_key.strftime("%d %B %Y")
                
                # Date header
                self.history_column.controls.append(
                    ft.Container(
                        content=ft.Text(date_text, 
                                       style=ft.TextThemeStyle.HEADLINE_SMALL,
                                       weight=ft.FontWeight.BOLD,
                                       color=ft.Colors.DEEP_PURPLE_200),
                        bgcolor=ft.Colors.GREY_800,
                        padding=ft.padding.symmetric(horizontal=20, vertical=12),
                        border_radius=12,
                        margin=ft.margin.only(top=20, bottom=10)
                    )
                )
                
                # Entries for this date
                for entry in sorted(entries, key=lambda x: x['completion_time'], reverse=True):
                    self.history_column.controls.append(self.create_history_card(entry))
        else:
            self.history_column.controls.append(
                ft.Container(
                    content=ft.Column([
                        ft.Icon(ft.Icons.HISTORY, size=64, color=ft.Colors.GREY),
                        ft.Text("No history yet", 
                               style=ft.TextThemeStyle.HEADLINE_SMALL,
                               text_align=ft.TextAlign.CENTER,
                               color=ft.Colors.GREY),
                        ft.Text("Complete or miss some tasks to see them here", 
                               style=ft.TextThemeStyle.BODY_LARGE,
                               text_align=ft.TextAlign.CENTER,
                               color=ft.Colors.GREY)
                    ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    alignment=ft.alignment.center,
                    padding=40,
                    margin=20
                )
            )
        
        # Update stats page if it exists
        if self.stats_page_container:
            self.stats_page_container.content = self.create_stats_page()
        
        # Update category dropdown on the main page
        if self.task_category_dropdown:
            self.task_category_dropdown.options = [
                ft.dropdown.Option(cat) for cat in self.data['categories']
            ]
        
        self.page.update()

    def main(self, page: ft.Page):
        """Main app function"""
        self.page = page
        page.title = "Motion Pro"
        page.theme_mode = ft.ThemeMode.DARK
        page.theme = ft.Theme(
            color_scheme_seed=ft.Colors.DEEP_PURPLE,
        )
        page.padding = 0
        page.scroll = ft.ScrollMode.AUTO
        page.window.width = 1200
        page.window.height = 800

        # Initialize form fields
        self.task_title_field = ft.TextField(
            label="Task Title",
            hint_text="Enter task description",
            expand=True,
            border_radius=8,
            bgcolor=ft.Colors.GREY_800,
            color=ft.Colors.WHITE
        )

        self.task_category_dropdown = ft.Dropdown(
            label="Category",
            options=[ft.dropdown.Option(cat) for cat in self.data['categories']],
            width=200,
            border_radius=8,
            bgcolor=ft.Colors.GREY_800,
            color=ft.Colors.WHITE
        )

        self.task_pp_field = ft.TextField(
            label="Base PP",
            hint_text="Points for completion",
            width=120,
            border_radius=8,
            bgcolor=ft.Colors.GREY_800,
            color=ft.Colors.WHITE
        )

        self.task_severity_dropdown = ft.Dropdown(
            label="Severity",
            options=[
                ft.dropdown.Option("low", "Low"),
                ft.dropdown.Option("med", "Medium"),
                ft.dropdown.Option("high", "High")
            ],
            width=150,
            border_radius=8,
            bgcolor=ft.Colors.GREY_800,
            color=ft.Colors.WHITE
        )

        # Date and time buttons
        self.date_button = ft.ElevatedButton(
            "Select Date 📅",
            icon=ft.Icons.CALENDAR_TODAY,
            on_click=self.open_date_picker,
            style=ft.ButtonStyle(
                bgcolor=ft.Colors.BLUE,
                color=ft.Colors.WHITE,
                shape=ft.RoundedRectangleBorder(radius=8)
            )
        )

        self.time_button = ft.ElevatedButton(
            "Select Time 🕐",
            icon=ft.Icons.ACCESS_TIME,
            on_click=self.open_time_picker,
            style=ft.ButtonStyle(
                bgcolor=ft.Colors.ORANGE,
                color=ft.Colors.WHITE,
                shape=ft.RoundedRectangleBorder(radius=8)
            )
        )

        # Create task form
        task_form = ft.Container(
            content=ft.Column([
                ft.Text("➕ Add New Task", 
                    style=ft.TextThemeStyle.HEADLINE_SMALL,
                    color=ft.Colors.WHITE,
                    weight=ft.FontWeight.BOLD),
                ft.Row([
                    self.task_title_field,
                    self.task_category_dropdown
                ], spacing=10),
                ft.Row([
                    self.task_pp_field,
                    self.task_severity_dropdown,
                    self.date_button,
                    self.time_button
                ], spacing=10),
                ft.Row([
                    ft.ElevatedButton(
                        "Add Task",
                        icon=ft.Icons.ADD,
                        on_click=self.add_task,
                        style=ft.ButtonStyle(
                            bgcolor=ft.Colors.GREEN,
                            color=ft.Colors.WHITE,
                            shape=ft.RoundedRectangleBorder(radius=8)
                        )
                    ),
                    ft.ElevatedButton(
                        "Manage Categories",
                        icon=ft.Icons.SETTINGS,
                        on_click=self.open_category_dialog,
                        style=ft.ButtonStyle(
                            bgcolor=ft.Colors.DEEP_PURPLE,
                            color=ft.Colors.WHITE,
                            shape=ft.RoundedRectangleBorder(radius=8)
                        )
                    )
                ], spacing=10)
            ], spacing=15),
            bgcolor=ft.Colors.GREY_800,
            padding=20,
            border_radius=12,
            margin=ft.margin.only(bottom=20)
        )

        # Initialize containers for dynamic content
        self.stats_container = ft.Container()
        self.active_tasks_column = ft.Column(spacing=10)
        self.history_column = ft.Column(spacing=10)
        self.stats_page_container = ft.Container()


        # Tab content
        def create_tasks_tab():
            return ft.Column([
                self.stats_container,
                task_form,
                ft.Container(
                    content=ft.Column([
                        ft.Text("📋 Active Tasks", 
                            style=ft.TextThemeStyle.HEADLINE_SMALL,
                            color=ft.Colors.WHITE,
                            weight=ft.FontWeight.BOLD),
                        self.active_tasks_column
                    ], spacing=10),
                    bgcolor=ft.Colors.GREY_800,
                    padding=20,
                    border_radius=12
                )
            ], scroll=ft.ScrollMode.AUTO, spacing=10)

        def create_history_tab():
            return ft.Column([
                ft.Container(
                    content=ft.Column([
                        ft.Text("📚 Task History", 
                            style=ft.TextThemeStyle.HEADLINE_SMALL,
                            color=ft.Colors.WHITE,
                            weight=ft.FontWeight.BOLD),
                        self.history_column
                    ], spacing=10),
                    bgcolor=ft.Colors.GREY_800,
                    padding=20,
                    border_radius=12,
                    expand=True
                )
            ], scroll=ft.ScrollMode.AUTO, spacing=10)

        def create_stats_tab():
            self.stats_page_container.content = self.create_stats_page()
            return self.stats_page_container

       # Create tabs
        tabs = ft.Tabs(
            selected_index=0,
            animation_duration=300,
            indicator_color=ft.Colors.DEEP_PURPLE,
            label_color=ft.Colors.WHITE,
            unselected_label_color=ft.Colors.GREY_400,
            tabs=[
                ft.Tab(
                    text="Tasks",
                    icon=ft.Icons.ASSIGNMENT,
                    content=create_tasks_tab()
                ),
                ft.Tab(
                    text="History",
                    icon=ft.Icons.HISTORY,
                    content=create_history_tab()
                ),
                ft.Tab(
                    text="Statistics",
                    icon=ft.Icons.ANALYTICS,
                    content=create_stats_tab()
                )
            ],
            expand=True
)
        
        # Ensure history column is properly initialized with content on startup
        def on_tab_change(e):
            if tabs.selected_index == 1:  # History tab
                self.refresh_ui()  # Refresh to ensure history is populated
        
        tabs.on_change = on_tab_change

        # Main layout
        page.add(
            ft.Container(
                content=tabs,
                padding=20,
                bgcolor=ft.Colors.GREY_900,
                expand=True
            )
        )

        # Initial UI refresh
        self.refresh_ui()

