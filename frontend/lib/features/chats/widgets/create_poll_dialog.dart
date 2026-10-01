import 'package:flutter/material.dart';

class CreatePollDialog extends StatefulWidget {
  const CreatePollDialog({super.key});
  static Future<Map<String, dynamic>?> show(BuildContext context) {
    return showDialog<Map<String, dynamic>>(context: context, builder: (_) => const CreatePollDialog());
  }
  @override
  State<CreatePollDialog> createState() => _CreatePollDialogState();
}

class _CreatePollDialogState extends State<CreatePollDialog> {
  final _questionController = TextEditingController();
  final List<TextEditingController> _optionControllers = [TextEditingController(), TextEditingController()];
  bool _isAnonymous = false;

  @override
  void dispose() {
    _questionController.dispose();
    for (final c in _optionControllers) {
      c.dispose();
    }
    super.dispose();
  }

  void _addOption() {
    setState(() => _optionControllers.add(TextEditingController()));
  }

  void _removeOption(int index) {
    if (_optionControllers.length <= 2) return;
    setState(() {
      _optionControllers[index].dispose();
      _optionControllers.removeAt(index);
    });
  }

  void _submit() {
    final q = _questionController.text.trim();
    final opts = _optionControllers.map((c) => c.text.trim()).where((t) => t.isNotEmpty).toList();
    if (q.isEmpty || opts.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter question and at least 2 options')));
      return;
    }
    Navigator.pop(context, {'question': q, 'options': opts, 'isAnonymous': _isAnonymous});
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Create poll'),
      content: SizedBox(
        width: 360,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: _questionController, decoration: const InputDecoration(labelText: 'Question', border: OutlineInputBorder())),
              const SizedBox(height: 12),
              ...List.generate(_optionControllers.length, (i) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(child: TextField(controller: _optionControllers[i], decoration: InputDecoration(labelText: 'Option ${i + 1}', border: const OutlineInputBorder()))),
                      IconButton(icon: const Icon(Icons.remove_circle_outline), onPressed: () => _removeOption(i)),
                    ],
                  ),
                );
              }),
              TextButton.icon(onPressed: _addOption, icon: const Icon(Icons.add), label: const Text('Add option')),
              SwitchListTile(value: _isAnonymous, title: const Text('Anonymous voting'), onChanged: (v) => setState(() => _isAnonymous = v)),
            ],
          ),
        ),
      ),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')), ElevatedButton(onPressed: _submit, child: const Text('Create Poll'))],
    );
  }
}
