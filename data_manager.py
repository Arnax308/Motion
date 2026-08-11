import os
import json
from typing import Dict

def load_data(data_file: str) -> dict:
    """Load data from JSON file or create default structure"""
    if os.path.exists(data_file):
        try:
            with open(data_file, 'r') as f:
                data = json.load(f)
                # Ensure all required fields exist
                if 'total_pp' not in data:
                    data['total_pp'] = 0
                if 'streak' not in data:
                    data['streak'] = 0
                if 'last_completion_date' not in data:
                    data['last_completion_date'] = None
                if 'active_tasks' not in data:
                    data['active_tasks'] = []
                if 'history' not in data:
                    data['history'] = []
                if 'categories' not in data:
                    data['categories'] = ['Work', 'Study', 'Exercise', 'Personal']
                
                # Update existing tasks to have severity if they don't
                for task in data['active_tasks']:
                    if 'severity' not in task:
                        task['severity'] = 'med'
                
                # Update history entries to have severity if they don't
                for entry in data['history']:
                    if 'severity' not in entry:
                        entry['severity'] = 'med'
                
                return data
        except:
            pass
    
    return {
        'total_pp': 0,
        'streak': 0,
        'last_completion_date': None,
        'active_tasks': [],
        'history': [],
        'categories': ['Work', 'Study', 'Exercise', 'Personal']
    }

def save_data(data_file: str, data: dict):
    """Save data to JSON file"""
    with open(data_file, 'w') as f:
        json.dump(data, f, indent=2)

